import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { auth } from '@/lib/auth'
import { requirePlan } from '@/lib/subscription'
import { msAuthorizeUrl } from '@/lib/microsoft'

/**
 * GET /api/auth/microsoft/start
 *
 * Kicks off the standalone MS OAuth dance. Generates a random state,
 * stores it in a short-lived cookie, and redirects to the Azure AD
 * authorize endpoint. The callback validates the state.
 *
 * Requires the caller to already be signed in (via Google NextAuth)
 * and on the family_plus plan.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', '/dashboard')
    return NextResponse.redirect(loginUrl)
  }

  const denied = await requirePlan(session.user.email, 'family_plus')
  if (denied) {
    return NextResponse.redirect(new URL('/billing?required=outlook', req.url))
  }

  const state = randomBytes(16).toString('hex')

  const res = NextResponse.redirect(msAuthorizeUrl(state))
  res.cookies.set('ms_oauth_state', state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/api/auth/microsoft/callback',
    maxAge:   10 * 60,  // 10 minutes is plenty for consent flow
  })
  return res
}
