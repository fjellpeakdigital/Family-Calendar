import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'
import type { ConfigJson } from '@/lib/supabase/types'

/**
 * Dashboard Server Component.
 * Fetches config from DB server-side, passes serializable props to the
 * client component. No tokens, no secrets ever reach the browser.
 */
export default async function DashboardPage() {
  const session = await auth()
  const email = session!.user!.email!

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id, name, role')
    .eq('email', email)
    .single()

  let config: ConfigJson = {
    people: [],
    chores: [],
    cal_assignments: [],
    settings: { location: '', use24h: false, theme: 'dark', pin: '1234' },
    rewards: {},
    points: {},
  }

  if (user) {
    const { data: cfgRow } = await supabase
      .from('family_config')
      .select('config_json')
      .eq('family_id', user.family_id)
      .single()

    if (cfgRow?.config_json) {
      config = cfgRow.config_json as ConfigJson
    }
  }

  return (
    <DashboardClient
      initialConfig={config}
      userEmail={email}
      userName={user?.name ?? null}
    />
  )
}
