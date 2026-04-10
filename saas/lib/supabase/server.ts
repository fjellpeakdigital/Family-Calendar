import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Supabase client for use in Server Components, Route Handlers,
 * and Server Actions.
 *
 * Uses the SERVICE ROLE key to bypass Row-Level Security.
 * This is intentional: this app uses NextAuth for authentication
 * (not Supabase Auth), so Supabase has no JWT to validate against
 * RLS policies. Auth is verified server-side via auth() before any
 * query runs, and all queries are manually scoped to the correct
 * family_id derived from the verified session.
 *
 * The cookies parameter is kept for future compatibility if we ever
 * add Supabase Realtime server-side; it is not used for auth here.
 */
export async function createClient() {
  // Consume the cookie store so Next.js tracks this as a dynamic function
  // (prevents incorrect static caching of pages that read user data).
  await cookies()

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Admin client — same as createClient() in this setup, kept as a
 * named export for clarity in Stripe webhooks and other system code.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
