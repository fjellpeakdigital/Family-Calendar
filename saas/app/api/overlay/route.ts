import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

// ── Validation limits ──────────────────────────────────────────
const MAX_KEY_LEN            = 500
const MAX_PERSON_ID_LEN       = 50
const MAX_PEOPLE_PER_ARRAY    = 20
const MAX_OFFSET_MIN          = 60 * 24 * 14  // 14 days

type Scope = 'instance' | 'series'

interface UpsertBody {
  scope: Scope
  key: string
  attendee_person_ids: string[]
  responsible_person_ids: string[]
  offset_min?: number | null
}

function isStringArray(v: unknown, maxLen: number, maxItems: number): v is string[] {
  if (!Array.isArray(v) || v.length > maxItems) return false
  return v.every(x => typeof x === 'string' && x.length > 0 && x.length <= maxLen)
}

function validateBody(raw: unknown): UpsertBody | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'body must be an object' }
  const r = raw as Record<string, unknown>

  if (r.scope !== 'instance' && r.scope !== 'series') {
    return { error: "scope must be 'instance' or 'series'" }
  }
  if (typeof r.key !== 'string' || r.key.length === 0 || r.key.length > MAX_KEY_LEN) {
    return { error: 'key must be a non-empty string' }
  }
  if (!isStringArray(r.attendee_person_ids, MAX_PERSON_ID_LEN, MAX_PEOPLE_PER_ARRAY)) {
    return { error: 'attendee_person_ids must be an array of strings' }
  }
  if (!isStringArray(r.responsible_person_ids, MAX_PERSON_ID_LEN, MAX_PEOPLE_PER_ARRAY)) {
    return { error: 'responsible_person_ids must be an array of strings' }
  }
  if (r.offset_min != null) {
    const n = r.offset_min
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_OFFSET_MIN) {
      return { error: `offset_min must be an integer 0..${MAX_OFFSET_MIN}` }
    }
  }

  return {
    scope: r.scope as Scope,
    key: r.key,
    attendee_person_ids: r.attendee_person_ids,
    responsible_person_ids: r.responsible_person_ids,
    offset_min: (r.offset_min as number | null | undefined) ?? null,
  }
}

async function resolveFamilyId(email: string) {
  const supabase = await createClient()
  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', email)
    .single()
  return { supabase, familyId: user?.family_id as string | undefined }
}

// PUT /api/overlay — upsert an instance or series overlay.
// Body: { scope, key, attendee_person_ids, responsible_person_ids, offset_min? }
export async function PUT(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = validateBody(raw)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const { supabase, familyId } = await resolveFamilyId(session.user.email)
  if (!familyId) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (parsed.scope === 'instance') {
    const { error } = await supabase.from('event_instance_overlay').upsert(
      {
        family_id: familyId,
        event_key: parsed.key,
        attendee_person_ids: parsed.attendee_person_ids,
        responsible_person_ids: parsed.responsible_person_ids,
        offset_min: parsed.offset_min,
      },
      { onConflict: 'family_id,event_key' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('event_series_overlay').upsert(
      {
        family_id: familyId,
        recurring_event_id: parsed.key,
        attendee_person_ids: parsed.attendee_person_ids,
        responsible_person_ids: parsed.responsible_person_ids,
        default_offset_min: parsed.offset_min,
      },
      { onConflict: 'family_id,recurring_event_id' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/overlay?scope=instance&key=...
export async function DELETE(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const scope = searchParams.get('scope')
  const key   = searchParams.get('key')

  if (scope !== 'instance' && scope !== 'series') {
    return NextResponse.json({ error: "scope must be 'instance' or 'series'" }, { status: 400 })
  }
  if (!key || key.length === 0 || key.length > MAX_KEY_LEN) {
    return NextResponse.json({ error: 'key required' }, { status: 400 })
  }

  const { supabase, familyId } = await resolveFamilyId(session.user.email)
  if (!familyId) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (scope === 'instance') {
    const { error } = await supabase
      .from('event_instance_overlay')
      .delete()
      .eq('family_id', familyId)
      .eq('event_key', key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('event_series_overlay')
      .delete()
      .eq('family_id', familyId)
      .eq('recurring_event_id', key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
