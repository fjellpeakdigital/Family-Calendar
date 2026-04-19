import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import type { PushSubscriptionRecord, UserNotificationPrefs } from '@/lib/supabase/types'

const MAX_ENDPOINTS_PER_USER = 5

/**
 * POST /api/push/subscribe — register a browser push subscription.
 * Body: { endpoint, keys: { p256dh, auth } }
 * Stored into user_notification_prefs.push_endpoints, deduplicated by endpoint.
 * Caps per-user endpoints so a buggy client can't fill the column.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const r = body as Record<string, unknown>
  const endpoint = typeof r.endpoint === 'string' ? r.endpoint : null
  const keys = r.keys as { p256dh?: unknown; auth?: unknown } | undefined
  const p256dh = typeof keys?.p256dh === 'string' ? keys.p256dh : null
  const authKey = typeof keys?.auth === 'string' ? keys.auth : null

  if (!endpoint || !p256dh || !authKey || endpoint.length > 1000) {
    return NextResponse.json({ error: 'endpoint + keys.p256dh + keys.auth required' }, { status: 400 })
  }

  const userAgent = req.headers.get('user-agent')

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
  const withoutDuplicate = current.filter((e: PushSubscriptionRecord) => e.endpoint !== endpoint)
  const trimmed = withoutDuplicate.slice(-(MAX_ENDPOINTS_PER_USER - 1))
  const next: PushSubscriptionRecord[] = [
    ...trimmed,
    {
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: userAgent ? userAgent.slice(0, 200) : null,
      created_at: new Date().toISOString(),
    },
  ]

  const { error } = await supabase
    .from('user_notification_prefs')
    .upsert(
      {
        user_id:        user.id,
        push_enabled:   true,
        push_endpoints: next,
      },
      { onConflict: 'user_id' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
