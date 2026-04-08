import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PLAN_DETAILS } from '@/lib/stripe'
import BillingClient from './BillingClient'
import type { Plan } from '@/lib/supabase/types'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>
}) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()

  const { data: family } = user
    ? await supabase
        .from('families')
        .select('plan, stripe_customer_id')
        .eq('id', user.family_id)
        .single()
    : { data: null }

  const currentPlan = (family?.plan ?? 'free') as Plan
  const hasStripeCustomer = !!family?.stripe_customer_id

  const params = await searchParams

  return (
    <BillingClient
      currentPlan={currentPlan}
      hasStripeCustomer={hasStripeCustomer}
      successMessage={params.success ? 'Your plan has been updated!' : null}
      cancelMessage={params.canceled ? 'Checkout canceled — no charge was made.' : null}
    />
  )
}
