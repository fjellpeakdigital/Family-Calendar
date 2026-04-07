import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware runs on every matched route.
 * - Protects /dashboard and /api/* (except auth routes)
 * - Unauthenticated requests are redirected to /login
 * - Sets security headers on all responses
 */
export default auth((req) => {
  const { nextUrl, auth: session } = req as NextRequest & { auth: unknown }
  const isLoggedIn = !!session

  const isAuthRoute    = nextUrl.pathname.startsWith('/api/auth')
  const isDashboard    = nextUrl.pathname.startsWith('/dashboard')
  const isProtectedApi = nextUrl.pathname.startsWith('/api') && !isAuthRoute

  if ((isDashboard || isProtectedApi) && !isLoggedIn) {
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
  // Strict Transport Security (1 year, include subdomains)
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  // Deny framing to prevent clickjacking
  res.headers.set('X-Frame-Options', 'DENY')
  // Prevent MIME sniffing
  res.headers.set('X-Content-Type-Options', 'nosniff')
  // Referrer policy — no referrer to third parties
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  // Permissions policy — minimal surface
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // Content Security Policy
  // nonce-based inline scripts are handled by Next.js Script component
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval'", // unsafe-eval needed by Next.js dev mode; lock down in prod
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https://openweathermap.org",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
    ].join('; ')
  )
}

export const config = {
  matcher: [
    // Match everything except _next static files and public assets
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
}
