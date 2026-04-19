/**
 * Microsoft Graph calendar adapter. Pulls events via the Graph
 * calendarView endpoint, which expands recurring series for us (the
 * equivalent of Google's singleEvents=true).
 */

import { decryptToken, encryptToken } from '@/lib/crypto'
import { createClient } from '@/lib/supabase/server'
import { msRefreshToken } from '@/lib/microsoft'
import type { OAuthToken } from '@/lib/supabase/types'
import type { CalendarSourceAdapter, RawEvent, SourceFetchContext } from './types'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

interface MsEvent {
  id:             string
  subject?:       string
  location?:      { displayName?: string }
  start:          { dateTime: string; timeZone: string }
  end:            { dateTime: string; timeZone: string }
  isAllDay?:      boolean
  seriesMasterId?: string
  /** Populated for expanded recurring instances. */
  originalStart?: string
}

async function getAccessToken(tok: OAuthToken): Promise<string> {
  const expiresAt = tok.expires_at ? new Date(tok.expires_at) : null
  const isExpired = !expiresAt || expiresAt <= new Date(Date.now() + 60_000)

  if (!isExpired) return decryptToken(tok.access_token_enc)
  if (!tok.refresh_token_enc) throw new Error(`No MS refresh token for ${tok.account_email}`)

  const refresh = decryptToken(tok.refresh_token_enc)
  const fresh   = await msRefreshToken(refresh)

  const newExpiresAt = new Date(Date.now() + (fresh.expires_in ?? 3600) * 1000).toISOString()

  const supabase = await createClient()
  await supabase
    .from('oauth_tokens')
    .update({
      access_token_enc:  encryptToken(fresh.access_token),
      // MS rotates refresh tokens, re-persist when present.
      refresh_token_enc: fresh.refresh_token ? encryptToken(fresh.refresh_token) : tok.refresh_token_enc,
      expires_at:        newExpiresAt,
    })
    .eq('id', tok.id)

  return fresh.access_token
}

function graphTimeToIso(raw: string): string {
  // Graph returns 'YYYY-MM-DDTHH:mm:ss.SSSSSSS' without a tz suffix
  // when tz='UTC'; normalize to ISO-Z for downstream consumers.
  if (/Z$|[+-]\d{2}:\d{2}$/.test(raw)) return raw
  const trimmed = raw.replace(/(\.\d{3})\d+$/, '$1')
  return trimmed.endsWith('Z') ? trimmed : `${trimmed}Z`
}

export const microsoftAdapter: CalendarSourceAdapter = {
  provider: 'microsoft',

  async fetchRaw(ctx: SourceFetchContext): Promise<RawEvent[]> {
    const accountEmail = ctx.assignment.accountEmail
    if (!accountEmail) return []

    const supabase = await createClient()
    const { data: tok } = await supabase
      .from('oauth_tokens')
      .select('*')
      .eq('family_id', ctx.familyId)
      .eq('provider', 'microsoft')
      .eq('account_email', accountEmail)
      .maybeSingle()
    if (!tok) return []

    let accessToken: string
    try {
      accessToken = await getAccessToken(tok as OAuthToken)
    } catch {
      return []
    }

    const params = new URLSearchParams({
      startDateTime: ctx.timeMin,
      endDateTime:   ctx.timeMax,
      '$top':        '250',
      '$orderby':    'start/dateTime',
      '$select':     'id,subject,location,start,end,isAllDay,seriesMasterId,originalStart',
    })

    const resp = await fetch(
      `${GRAPH_BASE}/me/calendars/${encodeURIComponent(ctx.assignment.calendarId)}/calendarView?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          // Tell Graph to hand us UTC across the board so graphTimeToIso can normalize cleanly.
          Prefer:         'outlook.timezone="UTC"',
        },
      }
    )
    if (!resp.ok) return []

    const data  = await resp.json() as { value?: MsEvent[] }
    const items = data.value ?? []

    return items.map<RawEvent>(ev => ({
      sourceId:         ev.id,
      title:            ev.subject ?? '(No title)',
      start:            graphTimeToIso(ev.start.dateTime),
      end:              graphTimeToIso(ev.end.dateTime),
      allDay:           !!ev.isAllDay,
      location:         ev.location?.displayName ?? null,
      recurringEventId: ev.seriesMasterId ?? null,
      originalStart:    ev.originalStart ? graphTimeToIso(ev.originalStart) : null,
    }))
  },
}
