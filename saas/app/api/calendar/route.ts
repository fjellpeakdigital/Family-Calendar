import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchFamilyEvents } from '@/lib/google-calendar'
import { rateLimit } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse date range from query params
  const { searchParams } = req.nextUrl
  const timeMin = searchParams.get('timeMin')
  const timeMax = searchParams.get('timeMax')

  if (!timeMin || !timeMax) {
    return NextResponse.json(
      { error: 'timeMin and timeMax query params are required (ISO 8601)' },
      { status: 400 }
    )
  }

  // Validate dates to prevent injection
  if (isNaN(Date.parse(timeMin)) || isNaN(Date.parse(timeMax))) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  const supabase = await createClient()

  // Get the user's family
  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Get family config (contains cal_assignments and people)
  const { data: config } = await supabase
    .from('family_config')
    .select('config_json')
    .eq('family_id', user.family_id)
    .single()

  if (!config?.config_json) {
    return NextResponse.json({ events: [] })
  }

  const cfg = config.config_json as import('@/lib/supabase/types').ConfigJson

  // Fetch events across every configured source (Google + ICS). Never
  // stored — returned directly to the caller.
  const events = await fetchFamilyEvents(user.family_id, timeMin, timeMax, cfg)

  // No caching — events are always fresh
  return NextResponse.json(
    { events },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  )
}
