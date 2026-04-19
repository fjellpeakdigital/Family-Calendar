/**
 * Minimal Auth.js adapter. Only the pieces needed to support email
 * magic links alongside our existing JWT-session OAuth flow:
 *   • createUser / getUser / getUserByEmail / updateUser
 *       backed by the existing `users` table (+ a fresh `families` row)
 *   • linkAccount   — no-op because we don't persist an accounts table;
 *                     OAuth provider tokens are stored in oauth_tokens
 *                     from the signIn callback in lib/auth.ts
 *   • createVerificationToken / useVerificationToken
 *       backed by the `verification_tokens` table (migration 003)
 *
 * All session-related adapter methods are omitted — we stay on JWT
 * sessions, so NextAuth never calls them.
 */

import type { Adapter, AdapterUser, VerificationToken } from '@auth/core/adapters'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWelcomeEmail } from '@/lib/email'

interface DbUserRow {
  id:         string
  email:      string
  name:       string | null
}

function toAdapterUser(row: DbUserRow): AdapterUser {
  return {
    id:            row.id,
    email:         row.email,
    emailVerified: null,
    name:          row.name,
  }
}

export function createAuthAdapter(): Adapter {
  return {
    async createUser(user) {
      const supabase = createAdminClient()

      const { data: family, error: familyError } = await supabase
        .from('families')
        .insert({ plan: 'free' })
        .select('id')
        .single()
      if (familyError || !family) throw new Error('Failed to create family')

      const { data: dbUser, error: userError } = await supabase
        .from('users')
        .insert({
          family_id: family.id,
          email:     user.email,
          name:      user.name ?? null,
          role:      'owner',
        })
        .select('id, email, name')
        .single()
      if (userError || !dbUser) throw new Error('Failed to create user')

      // Fire-and-forget welcome email
      sendWelcomeEmail(user.email, user.name ?? null).catch(() => {})

      return toAdapterUser(dbUser as DbUserRow)
    },

    async getUser(id) {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('id', id)
        .maybeSingle()
      return data ? toAdapterUser(data as DbUserRow) : null
    },

    async getUserByEmail(email) {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('email', email)
        .maybeSingle()
      return data ? toAdapterUser(data as DbUserRow) : null
    },

    async updateUser(user) {
      const supabase = createAdminClient()
      const updates: Record<string, unknown> = {}
      if (user.name  !== undefined) updates.name  = user.name
      if (user.email !== undefined) updates.email = user.email
      if (Object.keys(updates).length > 0 && user.id) {
        await supabase.from('users').update(updates).eq('id', user.id)
      }
      const { data } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('id', user.id!)
        .single()
      return toAdapterUser((data ?? { id: user.id!, email: user.email ?? '', name: user.name ?? null }) as DbUserRow)
    },

    // No accounts table — OAuth provider tokens are stored separately in
    // oauth_tokens from the signIn callback. Returning the account keeps
    // the NextAuth sign-in flow happy.
    async linkAccount(account) {
      return account
    },

    async createVerificationToken(vt) {
      const supabase = createAdminClient()
      const { error } = await supabase.from('verification_tokens').insert({
        identifier: vt.identifier,
        token:      vt.token,
        expires:    vt.expires.toISOString(),
      })
      if (error) throw error
      return vt
    },

    async useVerificationToken({ identifier, token }) {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('verification_tokens')
        .select('identifier, token, expires')
        .eq('identifier', identifier)
        .eq('token', token)
        .maybeSingle()
      if (!data) return null

      await supabase
        .from('verification_tokens')
        .delete()
        .eq('identifier', identifier)
        .eq('token', token)

      const vt: VerificationToken = {
        identifier: data.identifier as string,
        token:      data.token      as string,
        expires:    new Date(data.expires as string),
      }
      return vt
    },
  }
}
