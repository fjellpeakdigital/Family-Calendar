import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/stripe/portal
 * Creates a Stripe Customer Portal session for managing
 * subscriptions, payment methods, and invoices.
 */
export async function POST(req: NextRequest) {
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

  const { data: family } = await supabase
    .from('families')
    .select('stripe_customer_id')
    .eq('id', user.family_id)
    .single()

  if (!family?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 404 })
  }

  const stripe   = getStripe()
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL!

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   family.stripe_customer_id,
    return_url: `${appUrl}/billing`,
  })

  return NextResponse.json({ url: portalSession.url })
}
