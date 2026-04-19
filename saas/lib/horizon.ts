/**
 * event_horizon sync — populates a short-lived forward cache of
 * upcoming events so the reminder scheduler has something to query
 * without waiting for a dashboard to be open.
 *
 * Title and location are AES-256-GCM encrypted with the same key
 * scheme as oauth_tokens (crypto.ts). Plaintext lives only briefly
 * in memory during sync and reminder delivery.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/crypto'
import { fetchFamilyEvents } from '@/lib/google-calendar'
import type { ConfigJson } from '@/lib/supabase/types'

/** How far forward each sync pulls. Kept short so we hold minimal
 *  event metadata and can purge aggressively. */
export const HORIZON_WINDOW_HOURS = 48

/**
 * Sync the next HORIZON_WINDOW_HOURS of events for a single family.
 * Returns the number of rows upserted.
 */
export async function syncFamilyHorizon(familyId: string): Promise<{ upserted: number }> {
  const supabase = createAdminClient()

  const { data: fc } = await supabase
    .from('family_config')
    .select('config_json')
    .eq('family_id', familyId)
    .single()

  const config = (fc?.config_json as ConfigJson | undefined)
  if (!config) return { upserted: 0 }

  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + HORIZON_WINDOW_HOURS * 3_600_000).toISOString()

  const events = await fetchFamilyEvents(familyId, timeMin, timeMax, config)
  if (events.length === 0) return { upserted: 0 }

  const rows = events.map(e => ({
    family_id:          familyId,
    event_key:          e.eventKey,
    start_at:           e.start,
    end_at:             e.end,
    title_enc:          e.title    ? encryptToken(e.title)    : null,
    location_enc:       e.location ? encryptToken(e.location) : null,
    source_calendar_id: e.calendarId,
    source_provider:    'google',
    synced_at:          new Date().toISOString(),
  }))

  // Chunked upsert to stay well under Postgres param limits.
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('event_horizon')
      .upsert(slice, { onConflict: 'family_id,event_key' })
    if (error) throw error
  }

  return { upserted: rows.length }
}

/**
 * Walk every family with at least one connected Google account and
 * sync their horizon. Errors on individual families are swallowed so
 * a single broken account doesn't block the rest.
 */
export async function syncAllHorizons(): Promise<{ families: number; upserted: number; errors: string[] }> {
  const supabase = createAdminClient()

  const { data: families } = await supabase
    .from('oauth_tokens')
    .select('family_id')

  if (!families) return { families: 0, upserted: 0, errors: [] }

  const uniqueIds = Array.from(new Set(families.map(f => f.family_id)))
  const errors: string[] = []
  let totalUpserted = 0

  await Promise.allSettled(uniqueIds.map(async (fid) => {
    try {
      const { upserted } = await syncFamilyHorizon(fid)
      totalUpserted += upserted
    } catch (err) {
      errors.push(`family ${fid}: ${String(err)}`)
    }
  }))

  return { families: uniqueIds.length, upserted: totalUpserted, errors }
}
