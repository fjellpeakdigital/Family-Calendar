/**
 * Edge-compatible auth config — no Node.js imports.
 * Used by proxy.ts (runs in Edge Runtime).
 * The full auth.ts adds the signIn callback with crypto/Supabase.
 */
import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:       'openid email profile https://www.googleapis.com/auth/calendar.readonly',
          access_type: 'offline',
          prompt:      'consent',
        },
      },
    }),
  ],

  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  callbacks: {
    // Used by proxy to decide if the request is authorized
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = request.nextUrl

      const isAuthRoute    = pathname.startsWith('/api/auth')
      const isDashboard    = pathname.startsWith('/dashboard')
      const isOnboarding   = pathname.startsWith('/onboarding')
      const isProtectedApi = pathname.startsWith('/api') && !isAuthRoute

      if ((isDashboard || isOnboarding || isProtectedApi) && !isLoggedIn) {
        return false // proxy will redirect to /login
      }

      return true
    },
  },
}
