import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, planFromPriceId } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/stripe/webhook
 * Handles Stripe subscription lifecycle events.
 * Uses the admin Supabase client (bypasses RLS) since this runs
 * outside any user session — authenticated only by Stripe signature.
 *
 * IMPORTANT: This route must receive the raw body (not parsed JSON)
 * for signature verification. Next.js App Router gives us the raw
 * Request, so we read it as text before any parsing.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig     = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    await handleEvent(event)
  } catch (err) {
    console.error(`Webhook handler failed for ${event.type}:`, err)
    // Return 500 so Stripe retries on transient failures (DB outage, network error).
    // Deliberately-ignored event types never throw — they hit the default: break.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handleEvent(event: Stripe.Event) {
  const supabase = createAdminClient()

  switch (event.type) {
    // ── Subscription activated or updated ─────────────────────
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub      = event.data.object as Stripe.Subscription
      const familyId = sub.metadata?.family_id
      if (!familyId) {
        console.warn(`No family_id in subscription metadata: ${sub.id}`)
        break
      }

      const priceId = sub.items.data[0]?.price?.id ?? ''

      if (sub.status === 'active' || sub.status === 'trialing') {
        const newPlan = planFromPriceId(priceId)
        await supabase.from('families').update({ plan: newPlan }).eq('id', familyId)
        console.log(`Family ${familyId} → plan: ${newPlan} (sub: ${sub.id}, status: ${sub.status})`)
      } else if (sub.status === 'past_due' || sub.status === 'incomplete') {
        // Stripe is still retrying payment — hold the current plan. We will get
        // either a follow-up 'active' event (recovery) or 'subscription.deleted'
        // (cancellation) and can act then.
        console.log(`Family ${familyId}: sub ${sub.id} is ${sub.status} — holding current plan`)
      } else {
        // canceled, unpaid, incomplete_expired — downgrade
        await supabase.from('families').update({ plan: 'free' }).eq('id', familyId)
        console.log(`Family ${familyId} → free (sub: ${sub.id}, status: ${sub.status})`)
      }
      break
    }

    // ── Subscription cancelled ────────────────────────────────
    case 'customer.subscription.deleted': {
      const sub      = event.data.object as Stripe.Subscription
      const familyId = sub.metadata?.family_id
      if (!familyId) break

      // Guard against out-of-order events: if the customer already has another
      // active or trialing sub (e.g. immediate re-subscribe to a different plan),
      // skip the downgrade — the subscription.created event handles the upgrade.
      const stripe = getStripe()
      const [active, trialing] = await Promise.all([
        stripe.subscriptions.list({ customer: sub.customer as string, status: 'active',   limit: 1 }),
        stripe.subscriptions.list({ customer: sub.customer as string, status: 'trialing', limit: 1 }),
      ])
      if (active.data.length > 0 || trialing.data.length > 0) {
        console.log(`Family ${familyId}: sub ${sub.id} deleted but customer has another active sub — skipping downgrade`)
        break
      }

      await supabase.from('families').update({ plan: 'free' }).eq('id', familyId)
      console.log(`Family ${familyId} downgraded to free (sub deleted: ${sub.id})`)
      break
    }

    // ── Payment failed — grace period, don't downgrade yet ────
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      // Log but don't downgrade — Stripe will retry and send
      // customer.subscription.updated with status=past_due if it keeps failing
      console.warn(`Payment failed for customer ${invoice.customer}, invoice ${invoice.id}`)
      break
    }

    // ── Checkout completed — redundant but good for logging ───
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      console.log(`Checkout completed for customer ${session.customer}`)
      break
    }

    default:
      // Unhandled event type — not an error, just ignore
      break
  }
}
