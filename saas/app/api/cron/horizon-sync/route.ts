import { NextRequest, NextResponse } from 'next/server'
import { syncAllHorizons } from '@/lib/horizon'

/**
 * Sync the rolling event_horizon cache for every family.
 * Called by Vercel Cron. Secured with CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await syncAllHorizons()
  return NextResponse.json(result)
}
