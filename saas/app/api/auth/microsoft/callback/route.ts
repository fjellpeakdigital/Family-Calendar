import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/crypto'
import { msEmailFromIdToken, msExchangeCode } from '@/lib/microsoft'

/**
 * GET /api/auth/microsoft/callback
 *
 * Azure AD redirects here with ?code=... and ?state=... after the
 * user authorizes our app. We:
 *   1. validate the state cookie (CSRF defense)
 *   2. exchange the code for access + refresh tokens
 *   3. encrypt and upsert into oauth_tokens with provider='microsoft'
 *   4. redirect back to /dashboard
 *
 * Errors redirect to /dashboard with ?ms_error=... so the admin UI
 * can surface them.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const url   = req.nextUrl
  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err   = url.searchParams.get('error')
  const cookieState = req.cookies.get('ms_oauth_state')?.value

  if (err) {
    return NextResponse.redirect(new URL(`/dashboard?ms_error=${encodeURIComponent(err)}`, req.url))
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL('/dashboard?ms_error=state_mismatch', req.url))
  }

  let token
  try {
    token = await msExchangeCode(code)
  } catch {
    return NextResponse.redirect(new URL('/dashboard?ms_error=exchange_failed', req.url))
  }

  const accountEmail = token.id_token ? msEmailFromIdToken(token.id_token) : null
  if (!accountEmail) {
    return NextResponse.redirect(new URL('/dashboard?ms_error=no_email', req.url))
  }

  const supabase = createAdminClient()
  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()
  if (!user) {
    return NextResponse.redirect(new URL('/dashboard?ms_error=no_user', req.url))
  }

  const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString()

  await supabase.from('oauth_tokens').upsert(
    {
      family_id:         user.family_id,
      provider:          'microsoft',
      account_email:     accountEmail,
      access_token_enc:  encryptToken(token.access_token),
      refresh_token_enc: token.refresh_token ? encryptToken(token.refresh_token) : null,
      expires_at:        expiresAt,
      scopes:            token.scope ?? null,
    },
    { onConflict: 'family_id,provider,account_email' }
  )

  const res = NextResponse.redirect(new URL('/dashboard?ms_connected=1', req.url))
  res.cookies.delete('ms_oauth_state')
  return res
}
