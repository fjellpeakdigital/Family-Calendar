import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { decryptToken } from '@/lib/crypto'
import type { CalendarSourceProvider } from '@/lib/supabase/types'

/**
 * GET /api/account/calendars?email=someone@gmail.com[&provider=google|microsoft]
 * Lists the calendars available for a connected OAuth account.
 * Provider defaults to google for backwards compatibility.
 */
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accountEmail = req.nextUrl.searchParams.get('email')
  if (!accountEmail) {
    return NextResponse.json({ error: 'email param required' }, { status: 400 })
  }
  const provider = (req.nextUrl.searchParams.get('provider') ?? 'google') as CalendarSourceProvider
  if (provider !== 'google' && provider !== 'microsoft') {
    return NextResponse.json({ error: 'provider must be google or microsoft' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: tok } = await supabase
    .from('oauth_tokens')
    .select('access_token_enc, refresh_token_enc, expires_at, id, provider, account_email')
    .eq('family_id', user.family_id)
    .eq('provider', provider)
    .eq('account_email', accountEmail)
    .single()

  if (!tok) {
    return NextResponse.json({ error: 'Account not connected' }, { status: 404 })
  }

  const accessToken = await ensureFreshAccessToken(tok, provider)
  if (!accessToken) {
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 502 })
  }

  if (provider === 'google') {
    const resp = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!resp.ok) return NextResponse.json({ error: 'Failed to fetch calendars' }, { status: 502 })
    const data = await resp.json()
    const calendars = (data.items ?? []).map((c: { id: string; summary: string; backgroundColor: string }) => ({
      id:    c.id,
      name:  c.summary,
      color: c.backgroundColor,
    }))
    return NextResponse.json({ calendars })
  }

  // microsoft
  const resp = await fetch('https://graph.microsoft.com/v1.0/me/calendars?$top=100', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!resp.ok) return NextResponse.json({ error: 'Failed to fetch calendars' }, { status: 502 })
  const data = await resp.json() as { value?: Array<{ id: string; name: string; hexColor?: string; color?: string }> }
  const calendars = (data.value ?? []).map(c => ({
    id:    c.id,
    name:  c.name,
    color: c.hexColor ?? '#4f46e5',
  }))
  return NextResponse.json({ calendars })
}

/**
 * Return a valid access token for either provider, refreshing if
 * needed. Returns null on any failure so the caller can 502 cleanly.
 */
async function ensureFreshAccessToken(
  tok: {
    access_token_enc:  string
    refresh_token_enc: string | null
    expires_at:        string | null
    id:                string
  },
  provider: CalendarSourceProvider,
): Promise<string | null> {
  const expiresAt = tok.expires_at ? new Date(tok.expires_at) : null
  const isExpired = !expiresAt || expiresAt <= new Date(Date.now() + 60_000)
  if (!isExpired) return decryptToken(tok.access_token_enc)

  if (!tok.refresh_token_enc) return null
  const refresh = decryptToken(tok.refresh_token_enc)

  if (provider === 'google') {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refresh,
        grant_type:    'refresh_token',
      }),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.access_token as string
  }

  // microsoft
  const { msRefreshToken } = await import('@/lib/microsoft')
  try {
    const fresh = await msRefreshToken(refresh)
    return fresh.access_token
  } catch {
    return null
  }
}
