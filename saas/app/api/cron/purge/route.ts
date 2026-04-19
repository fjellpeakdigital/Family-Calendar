import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Daily purge — sweeps short-lived tables so we never hold more event
 * metadata or audit rows than necessary.
 *   • event_horizon: rows whose event ended > 24h ago
 *   • reminder_sends: entries older than 90 days
 *   • chore_completions: free plan 14 days, paid plan 90 days
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const [horizon, reminders, chores, verifTokens] = await Promise.all([
    supabase.rpc('purge_event_horizon_stale'),
    supabase.rpc('purge_reminder_sends_old'),
    supabase.rpc('purge_old_chore_completions'),
    supabase.rpc('purge_verification_tokens_expired'),
  ])

  const errors: string[] = []
  if (horizon.error)     errors.push(`horizon: ${horizon.error.message}`)
  if (reminders.error)   errors.push(`reminders: ${reminders.error.message}`)
  if (chores.error)      errors.push(`chores: ${chores.error.message}`)
  if (verifTokens.error) errors.push(`verif_tokens: ${verifTokens.error.message}`)

  return NextResponse.json({ ok: errors.length === 0, errors })
}
