import { NextRequest, NextResponse } from 'next/server'
import { auth, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

/**
 * DELETE /api/account/delete
 * GDPR right-to-erasure: deletes all data for this family within 24h.
 * CASCADE deletes handle users, tokens, config, and chore history.
 * Stripe customer deletion is handled here as well.
 */
export async function DELETE(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id, role')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Only the family owner can delete the account
  if (user.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only the account owner can delete the family account' },
      { status: 403 }
    )
  }

  // Get Stripe customer ID before deletion
  const { data: family } = await supabase
    .from('families')
    .select('stripe_customer_id')
    .eq('id', user.family_id)
    .single()

  // Cancel Stripe subscription if one exists
  if (family?.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      await stripe.customers.del(family.stripe_customer_id)
    } catch {
      // Log but don't block deletion — Stripe cleanup can be retried
      console.error('Stripe customer deletion failed — manual cleanup may be needed')
    }
  }

  // Delete the family — CASCADE handles everything else
  await supabase.from('families').delete().eq('id', user.family_id)

  return NextResponse.json({ ok: true, message: 'Account deleted successfully.' })
}
