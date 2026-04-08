import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getStripe, getPriceId, type PlanId, type BillingInterval } from '@/lib/stripe'
import { rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout session and returns the URL.
 * The client redirects to Stripe — no card data ever touches our server.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { plan: PlanId; interval: BillingInterval }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { plan, interval } = body

  if (!['family', 'family_plus'].includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }
  if (!['monthly', 'yearly'].includes(interval)) {
    return NextResponse.json({ error: 'Invalid interval' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id, email')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: family } = await supabase
    .from('families')
    .select('id, stripe_customer_id, plan')
    .eq('id', user.family_id)
    .single()

  if (!family) return NextResponse.json({ error: 'Family not found' }, { status: 404 })

  // Already on this plan — nothing to do
  if (family.plan === plan) {
    return NextResponse.json({ error: 'Already on this plan' }, { status: 400 })
  }

  const stripe = getStripe()

  // Get or create Stripe customer
  let customerId = family.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { family_id: family.id },
    })
    customerId = customer.id

    await supabase
      .from('families')
      .update({ stripe_customer_id: customerId })
      .eq('id', family.id)
  }

  const priceId = getPriceId(plan, interval)
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL!

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?success=1`,
    cancel_url:  `${appUrl}/billing?canceled=1`,
    subscription_data: {
      metadata: { family_id: family.id, plan },
    },
    // Collect billing address for tax purposes — no unnecessary PII
    billing_address_collection: 'auto',
    // Allow promo codes
    allow_promotion_codes: true,
    // Prefill email to reduce friction
    customer_email: customerId ? undefined : user.email,
  })

  return NextResponse.json({ url: checkoutSession.url })
}
