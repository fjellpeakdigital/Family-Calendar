import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

/**
 * GET /api/account/connected
 * Returns the list of connected Google accounts (emails only — no tokens).
 */
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: tokens } = await supabase
    .from('oauth_tokens')
    .select('provider, account_email, expires_at, scopes')
    .eq('family_id', user.family_id)

  return NextResponse.json({
    accounts: (tokens ?? []).map(t => ({
      provider:  t.provider ?? 'google',
      email:     t.account_email,
      expiresAt: t.expires_at,
      scopes:    t.scopes,
    })),
  })
}

/**
 * DELETE /api/account/connected?email=someone@gmail.com&provider=google
 * Disconnects a calendar account and removes its encrypted tokens.
 * `provider` defaults to 'google' for backwards compatibility with
 * callers that predate multi-provider support.
 */
export async function DELETE(req: NextRequest) {
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
  const provider = req.nextUrl.searchParams.get('provider') ?? 'google'

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await supabase
    .from('oauth_tokens')
    .delete()
    .eq('family_id', user.family_id)
    .eq('provider', provider)
    .eq('account_email', accountEmail)

  return NextResponse.json({ ok: true })
}
