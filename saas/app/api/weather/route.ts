import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

/**
 * GET /api/weather
 * Proxies OpenWeatherMap using the family's configured location.
 * Location is entered by the user (city name or lat/lon) — we never
 * infer it from IP or device. The API key stays server-side.
 */
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req)
  if (limited) return limited

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: config } = await supabase
    .from('family_config')
    .select('config_json')
    .eq('family_id', user.family_id)
    .single()

  const location: string =
    (config?.config_json as { settings?: { location?: string } })?.settings?.location ?? ''

  if (!location) {
    return NextResponse.json({ error: 'No location configured' }, { status: 400 })
  }

  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Weather service not configured' }, { status: 503 })
  }

  const params = new URLSearchParams({
    q: location,
    units: 'imperial',
    appid: apiKey,
  })

  const resp = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?${params}`,
    { next: { revalidate: 900 } } // cache 15 min at the edge
  )

  if (!resp.ok) {
    return NextResponse.json(
      { error: 'Weather fetch failed' },
      { status: resp.status === 404 ? 404 : 502 }
    )
  }

  const data = await resp.json()

  // Return only the fields the UI needs — don't forward raw API response
  return NextResponse.json({
    temp:        Math.round(data.main?.temp ?? 0),
    feelsLike:   Math.round(data.main?.feels_like ?? 0),
    description: data.weather?.[0]?.description ?? '',
    icon:        data.weather?.[0]?.icon ?? '',
    humidity:    data.main?.humidity ?? 0,
    windSpeed:   Math.round(data.wind?.speed ?? 0),
    location:    data.name ?? location,
  })
}
