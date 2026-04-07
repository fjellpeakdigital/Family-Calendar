import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { createClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/crypto'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],

  // Sessions as httpOnly cookies — tokens never touch the client
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },

  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== 'google') return false
      if (!user.email) return false

      const supabase = await createClient()

      // Upsert user row (email only — no profile photo stored)
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, family_id')
        .eq('email', user.email)
        .single()

      let familyId: string

      if (existingUser) {
        familyId = existingUser.family_id
      } else {
        // Create a new family for this user
        const { data: family, error: familyError } = await supabase
          .from('families')
          .insert({ plan: 'free' })
          .select('id')
          .single()

        if (familyError || !family) return false

        familyId = family.id

        await supabase.from('users').insert({
          family_id: familyId,
          email: user.email,
          name: user.name ?? null,
          role: 'owner',
        })
      }

      // Encrypt and upsert OAuth tokens
      if (account.access_token) {
        const encryptedAccess = encryptToken(account.access_token)
        const encryptedRefresh = account.refresh_token
          ? encryptToken(account.refresh_token)
          : null

        await supabase.from('oauth_tokens').upsert(
          {
            family_id: familyId,
            google_account_email: user.email,
            access_token_enc: encryptedAccess,
            refresh_token_enc: encryptedRefresh,
            expires_at: account.expires_at
              ? new Date(account.expires_at * 1000).toISOString()
              : null,
            scopes: account.scope ?? null,
          },
          { onConflict: 'family_id,google_account_email' }
        )
      }

      return true
    },

    async jwt({ token, user, account }) {
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
    error: '/login',
  },
})
