import type { Plan } from '@/lib/supabase/types'

/**
 * Plan tier limits.
 * Enforced in API routes before DB writes — don't rely solely on DB constraints.
 */
export const PLAN_LIMITS: Record<Plan, {
  maxGoogleAccounts: number
  maxKids: number
  historyDays: number
  maxDevices: number
  rewards: boolean
}> = {
  free: {
    maxGoogleAccounts: 1,
    maxKids: 2,
    historyDays: 14,
    maxDevices: 1,
    rewards: false,
  },
  family: {
    maxGoogleAccounts: Infinity,
    maxKids: Infinity,
    historyDays: 90,
    maxDevices: 5,
    rewards: false,
  },
  family_plus: {
    maxGoogleAccounts: Infinity,
    maxKids: Infinity,
    historyDays: 90,
    maxDevices: 10,
    rewards: true,
  },
}

export function getLimits(plan: Plan) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free
}
