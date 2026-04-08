import Stripe from 'stripe'

// Singleton — avoids creating a new client on every hot reload in dev
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-03-25.dahlia',
      typescript: true,
    })
  }
  return _stripe
}

// ── Price ID helpers ──────────────────────────────────────────

export type BillingInterval = 'monthly' | 'yearly'
export type PlanId = 'family' | 'family_plus'

export function getPriceId(plan: PlanId, interval: BillingInterval): string {
  const map: Record<PlanId, Record<BillingInterval, string>> = {
    family: {
      monthly: process.env.STRIPE_PRICE_FAMILY_MONTHLY!,
      yearly:  process.env.STRIPE_PRICE_FAMILY_YEARLY!,
    },
    family_plus: {
      monthly: process.env.STRIPE_PRICE_FAMILY_PLUS_MONTHLY!,
      yearly:  process.env.STRIPE_PRICE_FAMILY_PLUS_YEARLY!,
    },
  }
  const priceId = map[plan]?.[interval]
  if (!priceId) throw new Error(`No price ID configured for ${plan}/${interval}`)
  return priceId
}

// ── Plan mapping (Stripe price → our plan enum) ───────────────

const PRICE_TO_PLAN: Record<string, 'family' | 'family_plus'> = {}

export function planFromPriceId(priceId: string): 'free' | 'family' | 'family_plus' {
  // Build the reverse map lazily from env vars
  const envMap: Record<string, 'family' | 'family_plus'> = {
    [process.env.STRIPE_PRICE_FAMILY_MONTHLY!]:      'family',
    [process.env.STRIPE_PRICE_FAMILY_YEARLY!]:       'family',
    [process.env.STRIPE_PRICE_FAMILY_PLUS_MONTHLY!]: 'family_plus',
    [process.env.STRIPE_PRICE_FAMILY_PLUS_YEARLY!]:  'family_plus',
  }
  return envMap[priceId] ?? 'free'
}

// ── Human-readable plan details ───────────────────────────────

export const PLAN_DETAILS = {
  free: {
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    features: [
      '1 Google account',
      '2 kids',
      '14-day chore history',
      'Single device',
    ],
  },
  family: {
    name: 'Family',
    price: { monthly: 6, yearly: 55 },
    features: [
      'Unlimited Google accounts',
      'Unlimited kids',
      '90-day chore history',
      'Up to 5 devices',
      'Email support',
    ],
  },
  family_plus: {
    name: 'Family+',
    price: { monthly: 10, yearly: 89 },
    features: [
      'Everything in Family',
      'Chore rewards & streaks',
      'Multiple locations & weather',
      'Up to 10 devices',
      'Priority support',
    ],
  },
} as const
