import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'
import { createAdminClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/crypto'
import { sendWelcomeEmail } from '@/lib/email'
import { MS_SCOPES } from '@/lib/microsoft'

type DbProvider = 'google' | 'microsoft'

/**
 * Map a NextAuth provider id to the short name we store on
 * oauth_tokens.provider.
 */
function dbProvider(nextAuthId: string): DbProvider | null {
  if (nextAuthId === 'google')             return 'google'
  if (nextAuthId === 'microsoft-entra-id') return 'microsoft'
  return null
}

export const { handlers, auth, signIn, signOut } = NextAuth({
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
  ],

  // Sessions as httpOnly cookies — tokens never touch the client
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },

  callbacks: {
    async signIn({ user, account }) {
      if (!account || !user.email) return false

      const provider = dbProvider(account.provider)
      if (!provider) return false

      const supabase = createAdminClient()

      // Find or create the user + family. Email is the linkage key;
      // allowDangerousEmailAccountLinking on both providers means the
      // same email signing in through either provider lands on the
      // same row here.
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, family_id')
        .eq('email', user.email)
        .single()

      let familyId: string

      if (existingUser) {
        familyId = existingUser.family_id
      } else {
        const { data: family, error: familyError } = await supabase
          .from('families')
          .insert({ plan: 'free' })
          .select('id')
          .single()

        if (familyError || !family) return false
        familyId = family.id

        await supabase.from('users').insert({
          family_id: familyId,
          email:     user.email,
          name:      user.name ?? null,
          role:      'owner',
        })

        // Welcome email is best-effort — never block sign-in on it.
        sendWelcomeEmail(user.email, user.name ?? null).catch(() => {})
      }

      // Encrypt and upsert the OAuth tokens for whichever provider the
      // user signed in with. The composite (family_id, provider,
      // account_email) key lets Google + Microsoft coexist.
      if (account.access_token) {
        const encryptedAccess  = encryptToken(account.access_token)
        const encryptedRefresh = account.refresh_token
          ? encryptToken(account.refresh_token)
          : null

        await supabase.from('oauth_tokens').upsert(
          {
            family_id:         familyId,
            provider,
            account_email:     user.email,
            access_token_enc:  encryptedAccess,
            refresh_token_enc: encryptedRefresh,
            expires_at:        account.expires_at
              ? new Date(account.expires_at * 1000).toISOString()
              : null,
            scopes:            account.scope ?? null,
          },
          { onConflict: 'family_id,provider,account_email' }
        )
      }

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
