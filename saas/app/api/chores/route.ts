import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

// GET /api/chores?date=YYYY-MM-DD
// Returns today's chore completions for the family
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const date = searchParams.get('date')

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: completions } = await supabase
    .from('chore_completions')
    .select('kid_person_id, chore_id, points_earned')
    .eq('family_id', user.family_id)
    .eq('completed_date', date)

  return NextResponse.json({ completions: completions ?? [] })
}

// POST /api/chores
// Toggle a chore completion for today
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { kidPersonId: string; choreId: string; date: string; done: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { kidPersonId, choreId, date, done } = body

  if (!kidPersonId || !choreId || !date || typeof done !== 'boolean') {
    return NextResponse.json({ error: 'kidPersonId, choreId, date, done are required' }, { status: 400 })
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }

  // Validate IDs are safe strings (no SQL injection via jsonb queries)
  if (!/^[a-zA-Z0-9_-]+$/.test(kidPersonId) || !/^[a-zA-Z0-9_-]+$/.test(choreId)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Look up points for this chore from family_config
  const { data: config } = await supabase
    .from('family_config')
    .select('config_json')
    .eq('family_id', user.family_id)
    .single()

  const chores: Array<{ id: string; points: number }> =
    (config?.config_json as { chores?: Array<{ id: string; points: number }> })?.chores ?? []

  const chore = chores.find(c => c.id === choreId)
  const pointsEarned = done ? (chore?.points ?? 0) : 0

  if (done) {
    // Upsert completion (idempotent)
    await supabase.from('chore_completions').upsert(
      {
        family_id:     user.family_id,
        kid_person_id: kidPersonId,
        chore_id:      choreId,
        completed_date: date,
        points_earned:  pointsEarned,
      },
      { onConflict: 'family_id,kid_person_id,chore_id,completed_date' }
    )
  } else {
    // Remove completion
    await supabase
      .from('chore_completions')
      .delete()
      .eq('family_id',     user.family_id)
      .eq('kid_person_id', kidPersonId)
      .eq('chore_id',      choreId)
      .eq('completed_date', date)
  }

  return NextResponse.json({ ok: true })
}
