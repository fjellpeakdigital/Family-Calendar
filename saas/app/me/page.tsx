import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MeClient from '@/components/me/MeClient'
import type { ConfigJson, Plan } from '@/lib/supabase/types'

/**
 * /me — per-adult personal view.
 * Shows events where the signed-in user is either responsible or an attendee
 * over the next week. Optimized for mobile: this is the surface push
 * notifications and reminder emails link into.
 */
export default async function MePage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const email = session.user.email

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('id, family_id, name, person_id')
    .eq('email', email)
    .single()

  if (!user) redirect('/onboarding')

  const [fcRes, familyRes] = await Promise.all([
    supabase.from('family_config').select('config_json').eq('family_id', user.family_id).single(),
    supabase.from('families').select('plan').eq('id', user.family_id).single(),
  ])
  const config     = (fcRes.data?.config_json as ConfigJson | null | undefined)
  const familyPlan = (familyRes.data?.plan as Plan | undefined) ?? 'free'

  if (!config || config.people.length === 0) redirect('/onboarding')

  return (
    <MeClient
      userName={user.name ?? null}
      userEmail={email}
      userPersonId={user.person_id ?? null}
      people={config.people}
      use24h={config.settings?.use24h ?? false}
      familyPlan={familyPlan}
    />
  )
}
