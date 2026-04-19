import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import type { PushSubscriptionRecord, UserNotificationPrefs } from '@/lib/supabase/types'

/**
 * POST /api/push/unsubscribe — remove an endpoint (or all) for the user.
 * Body: { endpoint?: string }   — if missing, clears all endpoints and
 *                                  disables push.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const endpoint = typeof (body as { endpoint?: unknown }).endpoint === 'string'
    ? (body as { endpoint: string }).endpoint
    : null

  const supabase = await createClient()
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .single()
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: existing } = await supabase
    .from('user_notification_prefs')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const current = (existing as UserNotificationPrefs | null)?.push_endpoints ?? []
  const next = endpoint
    ? current.filter((e: PushSubscriptionRecord) => e.endpoint !== endpoint)
    : []

  const { error } = await supabase
    .from('user_notification_prefs')
    .upsert(
      {
        user_id:        user.id,
        push_enabled:   next.length > 0,
        push_endpoints: next,
      },
      { onConflict: 'user_id' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
