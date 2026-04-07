import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Uses the anon key + cookie-based session.
 * RLS is enforced by Postgres — every query is scoped to the
 * authenticated family automatically.
 *
 * NOTE: We intentionally skip the Database generic type here.
 * When you connect a real Supabase project, run:
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
 * and add it back as createServerClient<Database>(...)
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // In Server Components the cookie store is read-only —
            // middleware handles the refresh, so this is safe to ignore.
          }
        },
      },
    }
  )
}

/**
 * Admin client using the service role key — bypasses RLS.
 * ONLY use server-side for trusted internal operations
 * (e.g. scheduled purge jobs, Stripe webhooks).
 * Never expose the service role key to the client.
 */
export function createAdminClient() {
  const { createClient: createSupabaseClient } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@supabase/supabase-js') as typeof import('@supabase/supabase-js')
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
