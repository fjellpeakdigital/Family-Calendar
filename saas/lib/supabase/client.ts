import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for use in Client Components.
 * Used only for Realtime subscriptions — all data reads/writes
 * go through our API routes server-side.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
