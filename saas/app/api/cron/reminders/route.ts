import { NextRequest, NextResponse } from 'next/server'
import { processPendingReminders } from '@/lib/reminders'

/**
 * Reminder scheduler — emits email reminders for events whose
 * offset lands in the current minute. Called by Vercel Cron.
 * Secured with CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await processPendingReminders()
  return NextResponse.json(result)
}
