/**
 * Google Calendar adapter. Pulled out of the old top-level
 * lib/google-calendar.ts as part of the Phase 4 source abstraction.
 */

import { decryptToken, encryptToken } from '@/lib/crypto'
import { createClient } from '@/lib/supabase/server'
import type { OAuthToken } from '@/lib/supabase/types'
import type { CalendarSourceAdapter, RawEvent, SourceFetchContext } from './types'

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

interface GoogleCalendarItem {
  id:                 string
  summary?:           string
  location?:          string
  start:              { dateTime?: string; date?: string }
  end:                { dateTime?: string; date?: string }
  recurringEventId?:  string
  originalStartTime?: { dateTime?: string; date?: string }
}

/**
 * Get a valid access token for a given account, refreshing if expired.
 * Tokens are decrypted in memory and never returned to the client.
 */
async function getAccessToken(tok: OAuthToken): Promise<string> {
  const now = new Date()
  const expiresAt = tok.expires_at ? new Date(tok.expires_at) : null
  const isExpired = !expiresAt || expiresAt <= new Date(now.getTime() + 60_000)

  if (!isExpired) return decryptToken(tok.access_token_enc)

  if (!tok.refresh_token_enc) {
    throw new Error(`No refresh token for account ${tok.account_email}`)
  }

  const refreshToken = decryptToken(tok.refresh_token_enc)
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Token refresh failed for ${tok.account_email}: ${err}`)
  }

  const data = await resp.json()
  const newAccessToken: string = data.access_token
  const expiresIn: number = data.expires_in ?? 3600
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Persist the refreshed token (still encrypted)
  const supabase = await createClient()
  await supabase
    .from('oauth_tokens')
    .update({
      access_token_enc: encryptToken(newAccessToken),
      expires_at:       newExpiresAt,
    })
    .eq('id', tok.id)

  return newAccessToken
}

async function fetchOne(
  accessToken: string,
  calendarId:  string,
  timeMin:     string,
  timeMax:     string,
): Promise<GoogleCalendarItem[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '250',
  })

  const resp = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Calendar fetch failed (${resp.status}): ${err}`)
  }

  return ((await resp.json()).items as GoogleCalendarItem[] | undefined) ?? []
}

export const googleAdapter: CalendarSourceAdapter = {
  provider: 'google',

  async fetchRaw(ctx: SourceFetchContext): Promise<RawEvent[]> {
    const accountEmail = ctx.assignment.accountEmail
    if (!accountEmail) return []

    const supabase = await createClient()
    const { data: tok } = await supabase
      .from('oauth_tokens')
      .select('*')
      .eq('family_id', ctx.familyId)
      .eq('provider', 'google')
      .eq('account_email', accountEmail)
      .maybeSingle()

    if (!tok) return []

    let accessToken: string
    try {
      accessToken = await getAccessToken(tok as OAuthToken)
    } catch {
      return []
    }

    const items = await fetchOne(accessToken, ctx.assignment.calendarId, ctx.timeMin, ctx.timeMax)

    return items.map<RawEvent>(item => ({
      sourceId:         item.id,
      title:            item.summary ?? '(No title)',
      start:            (item.start.dateTime ?? item.start.date)!,
      end:              (item.end.dateTime   ?? item.end.date)!,
      allDay:           !item.start.dateTime,
      location:         item.location ?? null,
      recurringEventId: item.recurringEventId ?? null,
      originalStart:    item.originalStartTime?.dateTime ?? item.originalStartTime?.date ?? null,
    }))
  },
}
