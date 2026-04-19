/**
 * Reminder worker — scans event_horizon for events whose reminder
 * offset lands inside the current minute, then emails every responsible
 * adult. Idempotent via reminder_sends: a single (family, event, person,
 * offset, channel) tuple can only be delivered once.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { decryptToken } from '@/lib/crypto'
import { sendEventReminderEmail } from '@/lib/email'
import { sendPushNotification } from '@/lib/push'
import { getLimits } from '@/lib/limits'
import type {
  AppSettings,
  Plan,
  PushSubscriptionRecord,
  QuietHours,
  UserNotificationPrefs,
} from '@/lib/supabase/types'

const TICK_WINDOW_MS   = 60_000          // one-minute scheduler tick
const DEFAULT_OFFSET   = 15              // fallback family default (minutes)
export const MAX_SUPPORTED_OFFSET_MIN = 60 * 24   // 1 day — upper bound we fetch

interface HorizonRow {
  family_id:    string
  event_key:    string
  start_at:     string
  title_enc:    string | null
  location_enc: string | null
}

interface InstanceOverlayRow {
  family_id: string
  event_key: string
  responsible_person_ids: string[]
  offset_min: number | null
}

interface SeriesOverlayRow {
  family_id: string
  recurring_event_id: string
  responsible_person_ids: string[]
  default_offset_min: number | null
}

/**
 * Parse the series identity out of an eventKey. Recurring instances
 * are keyed '<recurringId>|<originalStart>'; singles have no pipe.
 */
function seriesIdOf(eventKey: string): string | null {
  const pipe = eventKey.indexOf('|')
  return pipe > 0 ? eventKey.slice(0, pipe) : null
}

export async function processPendingReminders(): Promise<{ sent: number; errors: string[] }> {
  const supabase = createAdminClient()
  const now       = new Date()
  const horizonMs = (MAX_SUPPORTED_OFFSET_MIN + 2) * 60_000
  const until     = new Date(now.getTime() + horizonMs)

  // 1. Candidate events: anything starting within the next MAX_OFFSET + slop
  const { data: rows } = await supabase
    .from('event_horizon')
    .select('family_id, event_key, start_at, title_enc, location_enc')
    .gte('start_at', now.toISOString())
    .lte('start_at', until.toISOString())

  const horizonRows = (rows ?? []) as HorizonRow[]
  if (horizonRows.length === 0) return { sent: 0, errors: [] }

  // 2. Group by family so we fetch overlays and users once per family
  const byFamily = new Map<string, HorizonRow[]>()
  for (const r of horizonRows) {
    const list = byFamily.get(r.family_id) ?? []
    list.push(r)
    byFamily.set(r.family_id, list)
  }

  let sent = 0
  const errors: string[] = []

  for (const [familyId, familyRows] of byFamily) {
    try {
      const count = await processFamily(familyId, familyRows, now)
      sent += count
    } catch (err) {
      errors.push(`family ${familyId}: ${String(err)}`)
    }
  }

  return { sent, errors }
}

async function processFamily(
  familyId: string,
  horizonRows: HorizonRow[],
  now: Date,
): Promise<number> {
  const supabase = createAdminClient()

  const eventKeys = horizonRows.map(r => r.event_key)
  const seriesIds = Array.from(new Set(
    horizonRows.map(r => seriesIdOf(r.event_key)).filter((x): x is string => !!x)
  ))

  const [instRes, seriesRes, cfgRes, usersRes, familyRes] = await Promise.all([
    supabase
      .from('event_instance_overlay')
      .select('family_id, event_key, responsible_person_ids, offset_min')
      .eq('family_id', familyId)
      .in('event_key', eventKeys),
    seriesIds.length
      ? supabase
          .from('event_series_overlay')
          .select('family_id, recurring_event_id, responsible_person_ids, default_offset_min')
          .eq('family_id', familyId)
          .in('recurring_event_id', seriesIds)
      : Promise.resolve({ data: [] as SeriesOverlayRow[] }),
    supabase
      .from('family_config')
      .select('config_json')
      .eq('family_id', familyId)
      .single(),
    supabase
      .from('users')
      .select('id, email, name, person_id')
      .eq('family_id', familyId),
    supabase
      .from('families')
      .select('plan')
      .eq('id', familyId)
      .single(),
  ])

  const plan   = ((familyRes.data?.plan as Plan | undefined) ?? 'free')
  const limits = getLimits(plan)

  // If the family's plan doesn't include any reminder channel at all,
  // exit before doing any additional work. Upgrading re-enables
  // reminders automatically — no data migration needed.
  if (!limits.emailReminders && !limits.pushReminders) return 0

  const instances = (instRes.data ?? []) as InstanceOverlayRow[]
  const series    = (seriesRes.data ?? []) as SeriesOverlayRow[]
  const users     = usersRes.data ?? []

  const instMap   = new Map(instances.map(r => [r.event_key, r]))
  const seriesMap = new Map(series.map(r => [r.recurring_event_id, r]))
  const userByPersonId = new Map(
    users.filter(u => u.person_id).map(u => [u.person_id as string, u])
  )

  // Family-default offset lives in AppSettings (added in Phase 2c).
  const settings = (cfgRes.data?.config_json as { settings?: AppSettings } | null)?.settings
  const familyDefaultOffset = normalizeOffset(settings?.defaultReminderOffsetMin) ?? DEFAULT_OFFSET

  // Per-user notification prefs — one query for everyone, then fan out.
  const userIds = users.map(u => u.id)
  const prefsRes = userIds.length
    ? await supabase
        .from('user_notification_prefs')
        .select('*')
        .in('user_id', userIds)
    : { data: [] as UserNotificationPrefs[] }
  const prefsByUser = new Map(
    ((prefsRes.data ?? []) as UserNotificationPrefs[]).map(p => [p.user_id, p])
  )

  // Iterate horizon rows, compute due sends per (user, channel)
  type Channel = 'email' | 'push'
  type DuePayload = {
    row: HorizonRow
    personId: string
    offsetMin: number
    channel: Channel
    user: typeof users[number]
    /** Push only — the specific endpoints this user has registered. */
    endpoints: PushSubscriptionRecord[]
  }
  const due: DuePayload[] = []

  for (const row of horizonRows) {
    const inst     = instMap.get(row.event_key)
    const seriesId = seriesIdOf(row.event_key)
    const ser      = seriesId ? seriesMap.get(seriesId) : undefined

    const responsible =
      inst?.responsible_person_ids?.length   ? inst.responsible_person_ids :
      ser?.responsible_person_ids?.length    ? ser.responsible_person_ids  :
      []
    if (responsible.length === 0) continue

    const offsetMin =
      (inst?.offset_min ?? null) ??
      (ser?.default_offset_min ?? null) ??
      familyDefaultOffset
    if (offsetMin == null) continue

    const remindAt = new Date(new Date(row.start_at).getTime() - offsetMin * 60_000)
    // Fires if remindAt falls inside [now, now + TICK_WINDOW_MS).
    if (remindAt < now || remindAt >= new Date(now.getTime() + TICK_WINDOW_MS)) continue

    for (const personId of responsible) {
      const user = userByPersonId.get(personId)
      if (!user) continue
      const prefs = prefsByUser.get(user.id)

      if (isInQuietHours(remindAt, prefs?.quiet_hours ?? null)) continue

      if (limits.emailReminders && prefs?.email_enabled !== false) {
        due.push({ row, personId, offsetMin, channel: 'email', user, endpoints: [] })
      }
      if (limits.pushReminders && prefs?.push_enabled && prefs.push_endpoints?.length > 0) {
        due.push({
          row, personId, offsetMin, channel: 'push', user,
          endpoints: prefs.push_endpoints,
        })
      }
    }
  }

  if (due.length === 0) return 0

  // Idempotency: one query to find already-sent reminders for the
  // event_keys we're about to touch (covers both email and push channels).
  const { data: sentRows } = await supabase
    .from('reminder_sends')
    .select('event_key, person_id, offset_min, channel')
    .eq('family_id', familyId)
    .in('event_key', due.map(d => d.row.event_key))

  const sentSet = new Set(
    (sentRows ?? []).map(r => `${r.event_key}|${r.person_id}|${r.offset_min}|${r.channel}`)
  )

  // Track per-user push endpoints that came back as gone so we can
  // remove them after the batch.
  const deadEndpointsByUser = new Map<string, Set<string>>()

  let actuallySent = 0

  for (const d of due) {
    const key = `${d.row.event_key}|${d.personId}|${d.offsetMin}|${d.channel}`
    if (sentSet.has(key)) continue

    // Reserve the slot first — composite PK blocks two workers from
    // double-sending the same reminder. Insert failure = raced, skip.
    const { error: insErr } = await supabase.from('reminder_sends').insert({
      family_id:  familyId,
      event_key:  d.row.event_key,
      person_id:  d.personId,
      offset_min: d.offsetMin,
      channel:    d.channel,
    })
    if (insErr) continue

    const title    = d.row.title_enc    ? decryptToken(d.row.title_enc)    : '(No title)'
    const location = d.row.location_enc ? decryptToken(d.row.location_enc) : null

    try {
      if (d.channel === 'email') {
        await sendEventReminderEmail({
          to:            d.user.email,
          recipientName: d.user.name ?? null,
          title,
          location,
          startAt:       d.row.start_at,
          use24h:        settings?.use24h ?? false,
        })
        actuallySent++
      } else {
        // Fan out to every registered endpoint for this user. Dead
        // endpoints get queued for removal below.
        let any = false
        for (const sub of d.endpoints) {
          const result = await sendPushNotification(sub, {
            title: `Reminder: ${title}`,
            body:  location ? `${whenShort(d.row.start_at, settings?.use24h ?? false)} · ${location}`
                            : whenShort(d.row.start_at, settings?.use24h ?? false),
            url:   '/me',
            tag:   `event:${d.row.event_key}:${d.offsetMin}`,
          })
          if (result.ok) any = true
          if (result.gone) {
            const set = deadEndpointsByUser.get(d.user.id) ?? new Set<string>()
            set.add(sub.endpoint)
            deadEndpointsByUser.set(d.user.id, set)
          }
        }
        if (any) actuallySent++
        else {
          // Roll back so we retry once the endpoints are fixed.
          await rollbackSend(familyId, d)
        }
      }
    } catch (err) {
      await rollbackSend(familyId, d)
      throw err
    }
  }

  // Prune any push endpoints that push services marked gone.
  if (deadEndpointsByUser.size > 0) {
    await Promise.allSettled(
      Array.from(deadEndpointsByUser.entries()).map(async ([userId, dead]) => {
        const prefs = prefsByUser.get(userId)
        if (!prefs) return
        const kept = prefs.push_endpoints.filter(e => !dead.has(e.endpoint))
        await supabase
          .from('user_notification_prefs')
          .update({
            push_endpoints: kept,
            push_enabled:   kept.length > 0,
          })
          .eq('user_id', userId)
      })
    )
  }

  return actuallySent
}

async function rollbackSend(
  familyId: string,
  d: { row: HorizonRow; personId: string; offsetMin: number; channel: 'email' | 'push' }
) {
  const supabase = createAdminClient()
  await supabase
    .from('reminder_sends')
    .delete()
    .eq('family_id',  familyId)
    .eq('event_key',  d.row.event_key)
    .eq('person_id',  d.personId)
    .eq('offset_min', d.offsetMin)
    .eq('channel',    d.channel)
}

function whenShort(iso: string, use24h: boolean): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  if (use24h) return `${String(h).padStart(2, '0')}:${m}`
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`
}

/**
 * Quiet hours are local to the user's browser time (we don't know their
 * tz server-side). Approximate: treat them as the server's local time.
 * Good enough for v1; revisit if we ever capture per-user timezone.
 */
function isInQuietHours(at: Date, qh: QuietHours | null): boolean {
  if (!qh) return false
  const [sh, sm] = qh.start.split(':').map(Number)
  const [eh, em] = qh.end.split(':').map(Number)
  const mins = at.getHours() * 60 + at.getMinutes()
  const startMins = sh * 60 + sm
  const endMins   = eh * 60 + em
  if (startMins === endMins) return false
  if (startMins < endMins) {
    return mins >= startMins && mins < endMins
  }
  // Overnight window like 22:00 → 07:00
  return mins >= startMins || mins < endMins
}

function normalizeOffset(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  const int = Math.round(n)
  if (int < 0 || int > MAX_SUPPORTED_OFFSET_MIN) return null
  return int
}
