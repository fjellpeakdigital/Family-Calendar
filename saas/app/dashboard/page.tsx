import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConfigProvider from '@/components/dashboard/ConfigProvider'
import DashboardClient from '@/components/dashboard/DashboardClient'
import type { ConfigJson, Plan } from '@/lib/supabase/types'

/**
 * Dashboard Server Component.
 * Fetches config + family plan from DB server-side.
 * Wraps the client tree in ConfigProvider for cross-device sync.
 * No tokens, no secrets ever reach the browser.
 */
export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const email = session.user.email

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id, name, role, person_id')
    .eq('email', email)
    .single()

  // First-time user — send to onboarding
  if (!user) redirect('/onboarding')

  const defaultConfig: ConfigJson = {
    people: [], chores: [], cal_assignments: [],
    settings: { location: '', use24h: false, theme: 'dark', pin: '1234' },
    rewards: {}, points: {},
  }

  const [configResult, familyResult] = await Promise.all([
    supabase.from('family_config').select('config_json').eq('family_id', user.family_id).single(),
    supabase.from('families').select('plan').eq('id', user.family_id).single(),
  ])

  const config      = (configResult.data?.config_json as ConfigJson) ?? defaultConfig
  const familyPlan  = (familyResult.data?.plan as Plan) ?? 'free'

  // No people configured yet — go to onboarding
  if (config.people.length === 0) redirect('/onboarding')

  // Auto-link: if the user has no person_id and there's exactly one adult,
  // link them. Saves onboarding friction for single-parent setups and also
  // self-heals existing accounts that pre-date the person_id column.
  let userPersonId: string | null = user.person_id ?? null
  if (!userPersonId) {
    const adults = config.people.filter(p => p.type === 'adult')
    if (adults.length === 1) {
      userPersonId = adults[0].id
      await supabase.from('users').update({ person_id: userPersonId }).eq('email', email)
    }
  }

  return (
    <ConfigProvider initialConfig={config} familyId={user.family_id}>
      <DashboardClient
        userEmail={email}
        userName={user.name ?? null}
        userPersonId={userPersonId}
        familyPlan={familyPlan}
      />
    </ConfigProvider>
  )
}

