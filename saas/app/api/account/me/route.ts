import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

const MAX_PERSON_ID_LEN = 50

// GET /api/account/me — return the signed-in user's own record, scoped
// to the fields the client cares about (person_id linkage).
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
    .select('id, family_id, name, email, role, person_id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  return NextResponse.json({ user })
}

// PUT /api/account/me — update fields the user is allowed to change
// on their own row. Today only person_id. Body: { person_id: string | null }
export async function PUT(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const r = body as Record<string, unknown>
  const raw = r.person_id
  const personId =
    raw === null ? null :
    typeof raw === 'string' && raw.length > 0 && raw.length <= MAX_PERSON_ID_LEN ? raw :
    undefined

  if (personId === undefined) {
    return NextResponse.json({ error: 'person_id must be a string or null' }, { status: 400 })
  }

  const supabase = await createClient()

  // Resolve family_id and validate that personId (if set) matches a real
  // person in this family's config. This prevents cross-family linkage.
  const { data: user } = await supabase
    .from('users')
    .select('id, family_id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (personId !== null) {
    const { data: cfg } = await supabase
      .from('family_config')
      .select('config_json')
      .eq('family_id', user.family_id)
      .single()

    const people = ((cfg?.config_json as { people?: Array<{ id: string; type?: string }> })?.people) ?? []
    const match  = people.find(p => p.id === personId)
    if (!match) {
      return NextResponse.json({ error: 'person_id not found in this family' }, { status: 400 })
    }
  }

  const { error } = await supabase
    .from('users')
    .update({ person_id: personId })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
