import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWeeklySummaryEmail } from '@/lib/email'

/**
 * Weekly chore summary email — called by Vercel Cron every Sunday at 09:00 UTC.
 * Secured by CRON_SECRET header (set in vercel.json + env vars).
 */
export async function GET(req: NextRequest) {
  // Verify the cron secret so this can't be triggered externally
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Fetch all families with their owner email + config
  const { data: families } = await supabase
    .from('families')
    .select('id')

  if (!families || families.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  let sent = 0
  const errors: string[] = []

  for (const family of families) {
    try {
      // Get owner email
      const { data: owner } = await supabase
        .from('users')
        .select('email, name')
        .eq('family_id', family.id)
        .eq('role', 'owner')
        .single()

      if (!owner) continue

      // Get config for kid list + points
      const { data: fc } = await supabase
        .from('family_config')
        .select('config_json')
        .eq('family_id', family.id)
        .single()

      if (!fc?.config_json) continue

      const config = fc.config_json
      const kids = (config.people ?? []).filter((p: { type: string }) => p.type === 'kid')
      if (kids.length === 0) continue

      // Get chore completions for the past 7 days
      const since = new Date()
      since.setDate(since.getDate() - 7)
      const sinceStr = since.toISOString().slice(0, 10)

      const { data: completions } = await supabase
        .from('chore_completions')
        .select('kid_person_id, chore_id, points_earned')
        .eq('family_id', family.id)
        .gte('completed_date', sinceStr)

      // Count chores per kid
      const kidSummaries = kids.map((kid: { id: string; name: string; color: string }) => {
        const kidCompletions = (completions ?? []).filter(
          (c: { kid_person_id: string }) => c.kid_person_id === kid.id
        )

        // Count unique chore+date combos (deduplicate)
        const completed = kidCompletions.length

        // Count how many chore-days were possible this week
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
        const chores: Array<{ kid_ids: string[]; days: string[] }> = config.chores ?? []
        const kidChores = chores.filter((c) => c.kid_ids.includes(kid.id))
        let total = 0
        for (let i = 0; i < 7; i++) {
          const d = new Date(since)
          d.setDate(since.getDate() + i)
          const dayName = dayNames[d.getDay()]
          total += kidChores.filter(c => c.days.includes(dayName)).length
        }

        const points: number = config.points?.[kid.id] ?? 0

        return { name: kid.name, color: kid.color, completed, total, points }
      })

      await sendWeeklySummaryEmail(owner.email, kidSummaries)
      sent++
    } catch (err) {
      errors.push(`family ${family.id}: ${String(err)}`)
    }
  }

  return NextResponse.json({ sent, errors })
}
