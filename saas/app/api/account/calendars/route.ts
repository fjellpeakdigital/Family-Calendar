import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { decryptToken } from '@/lib/crypto'

/**
 * GET /api/account/calendars?email=someone@gmail.com
 * Lists the Google calendars available for a connected account.
 * Used by the admin panel to populate the calendar assignment UI.
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

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Only fetch tokens belonging to this family (RLS also enforces this)
  const { data: tok } = await supabase
    .from('oauth_tokens')
    .select('access_token_enc, expires_at, refresh_token_enc, id')
    .eq('family_id', user.family_id)
    .eq('provider', 'google')
    .eq('account_email', accountEmail)
    .single()

  if (!tok) {
    return NextResponse.json({ error: 'Account not connected' }, { status: 404 })
  }

  const accessToken = decryptToken(tok.access_token_enc)

  const resp = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!resp.ok) {
    return NextResponse.json({ error: 'Failed to fetch calendars' }, { status: 502 })
  }

  const data = await resp.json()
  const calendars = (data.items ?? []).map((c: { id: string; summary: string; backgroundColor: string }) => ({
    id:         c.id,
    name:       c.summary,
    color:      c.backgroundColor,
  }))

  return NextResponse.json({ calendars })
}
