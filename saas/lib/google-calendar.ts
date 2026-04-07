import { decryptToken } from '@/lib/crypto'
import { createClient } from '@/lib/supabase/server'
import type { OAuthToken } from '@/lib/supabase/types'

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

export interface CalendarEvent {
  id: string
  title: string
  start: string        // ISO datetime or date
  end: string
  allDay: boolean
  calendarId: string
  personId: string
  personName: string
  color: string
}

/**
 * Get a valid access token for a given account, refreshing if expired.
 * Tokens are decrypted in memory and never returned to the client.
 */
async function getAccessToken(tok: OAuthToken): Promise<string> {
  const now = new Date()
  const expiresAt = tok.expires_at ? new Date(tok.expires_at) : null
  const isExpired = !expiresAt || expiresAt <= new Date(now.getTime() + 60_000)

  if (!isExpired) {
    return decryptToken(tok.access_token_enc)
  }

  // Token is expired — refresh it
  if (!tok.refresh_token_enc) {
    throw new Error(`No refresh token for account ${tok.google_account_email}`)
  }

  const refreshToken = decryptToken(tok.refresh_token_enc)
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Token refresh failed for ${tok.google_account_email}: ${err}`)
  }

  const data = await resp.json()
  const newAccessToken: string = data.access_token
  const expiresIn: number = data.expires_in ?? 3600
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Persist the refreshed token (still encrypted)
  const supabase = await createClient()
  const { encryptToken } = await import('@/lib/crypto')
  await supabase
    .from('oauth_tokens')
    .update({
      access_token_enc: encryptToken(newAccessToken),
      expires_at: newExpiresAt,
    })
    .eq('id', tok.id)

  return newAccessToken
}

/**
 * Fetch events from a single Google calendar.
 * Events are returned to the caller and never stored.
 */
async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<{ items: GoogleCalendarItem[] }> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })

  const resp = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!resp.ok) {
    // 401 = token invalid; 403 = access denied; 404 = calendar gone
    const err = await resp.text()
    throw new Error(`Calendar fetch failed (${resp.status}): ${err}`)
  }

  return resp.json()
}

interface GoogleCalendarItem {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end:   { dateTime?: string; date?: string }
}

/**
 * Fetch all events for this family across all connected Google accounts.
 * Called exclusively server-side — tokens never reach the client.
 */
export async function fetchFamilyEvents(
  familyId: string,
  timeMin: string,
  timeMax: string,
  configJson: {
    cal_assignments: Array<{
      calendarId: string
      accountEmail: string
      personId: string
      color: string
    }>
    people: Array<{ id: string; name: string }>
  }
): Promise<CalendarEvent[]> {
  const supabase = await createClient()

  // Load all tokens for this family
  const { data: tokens, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('family_id', familyId)

  if (error || !tokens?.length) return []

  const tokenMap = new Map<string, OAuthToken>(
    tokens.map(t => [t.google_account_email, t])
  )

  const personMap = new Map(
    configJson.people.map(p => [p.id, p.name])
  )

  const events: CalendarEvent[] = []

  // Process assignments grouped by account to minimize token decryptions
  const byAccount = new Map<string, typeof configJson.cal_assignments>()
  for (const a of configJson.cal_assignments) {
    const list = byAccount.get(a.accountEmail) ?? []
    list.push(a)
    byAccount.set(a.accountEmail, list)
  }

  await Promise.allSettled(
    Array.from(byAccount.entries()).map(async ([email, assignments]) => {
      const tok = tokenMap.get(email)
      if (!tok) return // account not connected — skip gracefully

      let accessToken: string
      try {
        accessToken = await getAccessToken(tok)
      } catch {
        return // expired with no refresh token — skip
      }

      await Promise.allSettled(
        assignments.map(async (assignment) => {
          try {
            const data = await fetchCalendarEvents(
              accessToken,
              assignment.calendarId,
              timeMin,
              timeMax
            )

            for (const item of data.items ?? []) {
              const allDay = !item.start.dateTime
              events.push({
                id: item.id,
                title: item.summary ?? '(No title)',
                start: (item.start.dateTime ?? item.start.date)!,
                end:   (item.end.dateTime   ?? item.end.date)!,
                allDay,
                calendarId: assignment.calendarId,
                personId:   assignment.personId,
                personName: personMap.get(assignment.personId) ?? '',
                color:      assignment.color,
              })
            }
          } catch {
            // Individual calendar failure — skip, don't abort all
          }
        })
      )
    })
  )

  return events
}
