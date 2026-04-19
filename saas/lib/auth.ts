import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'
import Resend from 'next-auth/providers/resend'
import { createAdminClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/crypto'
import { MS_SCOPES } from '@/lib/microsoft'
import { createAuthAdapter } from '@/lib/auth-adapter'

type DbProvider = 'google' | 'microsoft'

/**
 * Map a NextAuth provider id to the short name we store on
 * oauth_tokens.provider. Returns null for providers that don't
 * carry an OAuth access token (email magic link).
 */
function dbProvider(nextAuthId: string): DbProvider | null {
  if (nextAuthId === 'google')             return 'google'
  if (nextAuthId === 'microsoft-entra-id') return 'microsoft'
  return null
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Adapter is used only for:
  //   • email magic-link verification token storage
  //   • user / family row creation on first sign-in (any provider)
  // Session tokens remain JWT (see session.strategy below) — the
  // adapter's session methods are never invoked.
  adapter: createAuthAdapter(),

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // We trust Google's verified email claim to merge a Microsoft-
      // signed-in account with the same email later. See README.
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
    MicrosoftEntraID({
      clientId:     process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      issuer:       `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID ?? 'common'}/v2.0`,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: MS_SCOPES.join(' '),
          prompt: 'consent',
        },
      },
    }),
    Resend({
      apiKey: process.env.RESEND_API_KEY!,
      from:   process.env.EMAIL_FROM ?? 'FamilyDash <noreply@familydash.app>',
    }),
  ],

  // Sessions as httpOnly cookies — tokens never touch the client
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },

  callbacks: {
    async signIn({ user, account }) {
      if (!account || !user.email) return false

      // The email magic-link flow carries no OAuth access token, so
      // we only need to make sure the user row exists (the adapter
      // has already done that via createUser).
      const provider = dbProvider(account.provider)
      if (!provider) return true

      if (!account.access_token) return true

      // Persist the provider's OAuth tokens so lib/calendar-sources
      // can fetch that account's calendars going forward. The user
      // row was already created by the adapter before this callback
      // runs; we just need the family_id to scope the token row.
      const supabase = createAdminClient()
      const { data: dbUser } = await supabase
        .from('users')
        .select('family_id')
        .eq('email', user.email)
        .single()
      if (!dbUser) return false

      await supabase.from('oauth_tokens').upsert(
        {
          family_id:         dbUser.family_id,
          provider,
          account_email:     user.email,
          access_token_enc:  encryptToken(account.access_token),
          refresh_token_enc: account.refresh_token
            ? encryptToken(account.refresh_token)
            : null,
          expires_at:        account.expires_at
            ? new Date(account.expires_at * 1000).toISOString()
            : null,
          scopes:            account.scope ?? null,
        },
        { onConflict: 'family_id,provider,account_email' },
      )

      return true
    },

    async jwt({ token, user }) {
      if (user?.email) token.email = user.email
      return token
    },

    async session({ session, token }) {
      // Session only carries email — no tokens ever reach the client
      if (token.email) session.user.email = token.email as string
      return session
    },
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },
})
