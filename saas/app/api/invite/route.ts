import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createInviteToken } from '@/lib/invite'
import { sendInviteEmail } from '@/lib/email'

/**
 * POST /api/invite
 * Body: { email: string }
 * Creates a signed invite token and sends an email to the invitee.
 * Only the family owner can send invites.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = await req.json()
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify caller is owner
  const { data: inviter } = await supabase
    .from('users')
    .select('family_id, name, role')
    .eq('email', session.user.email)
    .single()

  if (!inviter) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (inviter.role !== 'owner') {
    return NextResponse.json({ error: 'Only the family owner can send invites' }, { status: 403 })
  }

  // Check invitee isn't already in this family
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .eq('family_id', inviter.family_id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'This person is already in your family' }, { status: 409 })
  }

  const token = createInviteToken(inviter.family_id, email)
  const inviterName = inviter.name ?? session.user.email.split('@')[0]

  await sendInviteEmail(email.toLowerCase().trim(), inviterName, token)

  return NextResponse.json({ ok: true })
}
