import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import type { QuietHours } from '@/lib/supabase/types'

/**
 * GET /api/account/prefs — return the signed-in user's notification prefs,
 * creating a row with sensible defaults if none exists yet.
 */
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .single()
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: prefs } = await supabase
    .from('user_notification_prefs')
    .select('email_enabled, push_enabled, quiet_hours, default_offsets')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    prefs: prefs ?? {
      email_enabled:    true,
      push_enabled:     false,
      quiet_hours:      null,
      default_offsets:  [15],
    },
  })
}

/**
 * PUT /api/account/prefs — update email/push toggles and quiet hours.
 * Push endpoints are registered via /api/push/subscribe, not here.
 */
export async function PUT(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const body = raw as {
    email_enabled?: unknown
    push_enabled?:  unknown
    quiet_hours?:   unknown
  }

  const update: Record<string, unknown> = {}
  if (body.email_enabled !== undefined) {
    if (typeof body.email_enabled !== 'boolean') {
      return NextResponse.json({ error: 'email_enabled must be boolean' }, { status: 400 })
    }
    update.email_enabled = body.email_enabled
  }
  if (body.push_enabled !== undefined) {
    if (typeof body.push_enabled !== 'boolean') {
      return NextResponse.json({ error: 'push_enabled must be boolean' }, { status: 400 })
    }
    update.push_enabled = body.push_enabled
  }
  if (body.quiet_hours !== undefined) {
    if (body.quiet_hours !== null) {
      const qh = body.quiet_hours as QuietHours | null
      if (
        !qh || typeof qh !== 'object' ||
        typeof qh.start !== 'string' || typeof qh.end !== 'string' ||
        !/^\d{2}:\d{2}$/.test(qh.start) || !/^\d{2}:\d{2}$/.test(qh.end)
      ) {
        return NextResponse.json(
          { error: 'quiet_hours must be { start: "HH:mm", end: "HH:mm" } or null' },
          { status: 400 }
        )
      }
    }
    update.quiet_hours = body.quiet_hours
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true })
  }

  const supabase = await createClient()
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .single()
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Upsert — creates the row with defaults the first time a user saves.
  const { error } = await supabase
    .from('user_notification_prefs')
    .upsert(
      { user_id: user.id, ...update },
      { onConflict: 'user_id' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
