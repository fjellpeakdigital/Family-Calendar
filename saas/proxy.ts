export const runtime = 'nodejs'

import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Proxy runs on every matched route (Next.js 16 replacement for middleware).
 * Defaults to Node.js runtime — no Edge Runtime restrictions.
 * - Protects /dashboard, /onboarding, and /api/* (except auth routes)
 * - Unauthenticated requests are redirected to /login
 * - Sets security headers on all responses
 */
export default auth((req) => {
  const { nextUrl, auth: session } = req as NextRequest & { auth: unknown }
  const isLoggedIn = !!session

  const isAuthRoute    = nextUrl.pathname.startsWith('/api/auth')
  const isDashboard    = nextUrl.pathname.startsWith('/dashboard')
  const isOnboarding   = nextUrl.pathname.startsWith('/onboarding')
  const isProtectedApi = nextUrl.pathname.startsWith('/api') && !isAuthRoute

  if ((isDashboard || isOnboarding || isProtectedApi) && !isLoggedIn) {
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', nextUrl))
  }

  const response = NextResponse.next()
  applySecurityHeaders(response)
  return response
})

function applySecurityHeaders(res: NextResponse) {
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https://openweathermap.org",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
    ].join('; ')
  )
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
}
