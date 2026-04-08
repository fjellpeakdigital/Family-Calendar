import { createClient } from '@/lib/supabase/server'
import { getLimits } from '@/lib/limits'
import type { Plan } from '@/lib/supabase/types'

/**
 * Get the plan for the currently authenticated family.
 * Returns 'free' if no session or DB row exists.
 */
export async function getFamilyPlan(email: string): Promise<Plan> {
  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', email)
    .single()

  if (!user) return 'free'

  const { data: family } = await supabase
    .from('families')
    .select('plan')
    .eq('id', user.family_id)
    .single()

  return (family?.plan as Plan) ?? 'free'
}

/**
 * Check a limit for the calling family and return an error response
 * if the limit is exceeded. Returns null if within limits.
 *
 * Usage in an API route:
 *   const exceeded = await checkLimit(email, 'maxKids', currentKidCount)
 *   if (exceeded) return exceeded
 */
export async function checkLimit(
  email: string,
  limitKey: keyof ReturnType<typeof getLimits>,
  currentCount: number
): Promise<{ error: string; upgradeRequired: true; plan: Plan } | null> {
  const plan   = await getFamilyPlan(email)
  const limits = getLimits(plan)
  const max    = limits[limitKey]

  if (typeof max === 'number' && currentCount >= max) {
    return {
      error: `Your ${plan} plan allows a maximum of ${max} ${limitKey.replace('max', '').toLowerCase()}. Upgrade to add more.`,
      upgradeRequired: true,
      plan,
    }
  }

  return null
}

/**
 * Require a specific plan or better. Returns a 403 response object
 * if the plan is insufficient, null if OK.
 *
 * Usage:
 *   const denied = await requirePlan(email, 'family')
 *   if (denied) return NextResponse.json(denied, { status: 403 })
 */
export async function requirePlan(
  email: string,
  minimumPlan: 'family' | 'family_plus'
): Promise<{ error: string; upgradeRequired: true; plan: Plan } | null> {
  const plan = await getFamilyPlan(email)
  const PLAN_RANK: Record<Plan, number> = { free: 0, family: 1, family_plus: 2 }

  if (PLAN_RANK[plan] < PLAN_RANK[minimumPlan]) {
    return {
      error: `This feature requires the ${minimumPlan} plan.`,
      upgradeRequired: true,
      plan,
    }
  }

  return null
}
