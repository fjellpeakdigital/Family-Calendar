import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OnboardingClient from '@/components/onboarding/OnboardingClient'

/**
 * Onboarding page — shown to new users after their first sign-in.
 * If they already have config (people defined), redirect to dashboard.
 */
export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()

  if (user) {
    const { data: config } = await supabase
      .from('family_config')
      .select('config_json')
      .eq('family_id', user.family_id)
      .single()

    const people = (config?.config_json as { people?: unknown[] } | null)?.people ?? []
    if (people.length > 0) redirect('/dashboard')
  }

  return <OnboardingClient userEmail={session.user.email!} />
}
