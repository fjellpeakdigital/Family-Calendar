import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { getFamilyPlan } from '@/lib/subscription'
import { getLimits } from '@/lib/limits'
import type { ConfigJson } from '@/lib/supabase/types'

// GET /api/config — fetch family config (people, chores, settings, rewards)
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
    .select('family_id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: config } = await supabase
    .from('family_config')
    .select('config_json, updated_at')
    .eq('family_id', user.family_id)
    .single()

  return NextResponse.json({
    config: config?.config_json ?? defaultConfig(),
    updatedAt: config?.updated_at ?? null,
  })
}

// PUT /api/config — save family config
export async function PUT(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { config: ConfigJson }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.config || typeof body.config !== 'object') {
    return NextResponse.json({ error: 'config object required' }, { status: 400 })
  }

  // Sanitize: strip any keys we don't expect to prevent junk storage
  const safe = sanitizeConfig(body.config)

  // Plan-gate the ICS feed count. Saving new feeds past the limit is
  // rejected; saving a shorter list than before (e.g. a user removing
  // feeds) is always allowed.
  const plan   = await getFamilyPlan(session.user.email)
  const limits = getLimits(plan)
  const icsCount = safe.cal_assignments.filter(a => a.provider === 'ics').length
  if (icsCount > limits.icsFeedsMax) {
    return NextResponse.json(
      {
        error: limits.icsFeedsMax === 0
          ? 'Calendar feeds require the family plan or higher.'
          : `Your plan allows up to ${limits.icsFeedsMax} calendar feed(s).`,
        upgradeRequired: true,
        plan,
      },
      { status: 402 },
    )
  }

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await supabase.from('family_config').upsert(
    { family_id: user.family_id, config_json: safe },
    { onConflict: 'family_id' }
  )

  return NextResponse.json({ ok: true })
}

function defaultConfig(): ConfigJson {
  return {
    people: [],
    chores: [],
    cal_assignments: [],
    settings: { location: '', use24h: false, theme: 'dark', pin: '1234', defaultReminderOffsetMin: null },
    rewards: {},
    points: {},
  }
}

/** Only accept plausible reminder offsets; anything else becomes null (off). */
function sanitizeOffset(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  if (n < 0 || n > 60 * 24) return null
  return n
}

function sanitizeConfig(raw: unknown): ConfigJson {
  const r = raw as Record<string, unknown>
  return {
    people:          Array.isArray(r.people)          ? r.people          : [],
    chores:          Array.isArray(r.chores)          ? r.chores          : [],
    cal_assignments: Array.isArray(r.cal_assignments) ? r.cal_assignments : [],
    settings: {
      location: typeof r.settings === 'object' && r.settings !== null
        ? String((r.settings as Record<string, unknown>).location ?? '')
        : '',
      use24h: typeof r.settings === 'object' && r.settings !== null
        ? !!(r.settings as Record<string, unknown>).use24h
        : false,
      theme: typeof r.settings === 'object' && r.settings !== null
        && (r.settings as Record<string, unknown>).theme === 'light' ? 'light' : 'dark',
      pin: typeof r.settings === 'object' && r.settings !== null
        ? String((r.settings as Record<string, unknown>).pin ?? '1234')
        : '1234',
      defaultReminderOffsetMin: sanitizeOffset(
        (r.settings as Record<string, unknown> | null | undefined)?.defaultReminderOffsetMin
      ),
    },
    rewards: typeof r.rewards === 'object' && r.rewards !== null
      ? r.rewards as Record<string, []>
      : {},
    points: typeof r.points === 'object' && r.points !== null
      ? r.points as Record<string, number>
      : {},
  }
}
