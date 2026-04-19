import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

/**
 * GET /api/account/export
 * GDPR right-to-access: returns all stored data for this family as JSON.
 * Tokens are NOT included (they're encrypted and server-internal).
 * Calendar event content is never stored, so nothing to export there.
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
    .select('id, family_id, email, name, role, created_at')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const [configResult, completionsResult, tokensResult] = await Promise.all([
    supabase
      .from('family_config')
      .select('config_json, updated_at')
      .eq('family_id', user.family_id)
      .single(),
    supabase
      .from('chore_completions')
      .select('kid_person_id, chore_id, completed_date, points_earned, completed_at')
      .eq('family_id', user.family_id)
      .order('completed_date', { ascending: false }),
    supabase
      .from('oauth_tokens')
      .select('provider, account_email, expires_at, scopes, created_at')
      .eq('family_id', user.family_id),
  ])

  const exportData = {
    exportedAt: new Date().toISOString(),
    note: 'Calendar event content is never stored — it is fetched live and discarded.',
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
      memberSince: user.created_at,
    },
    config: configResult.data?.config_json ?? null,
    choreHistory: completionsResult.data ?? [],
    connectedAccounts: (tokensResult.data ?? []).map(t => ({
      provider:  t.provider ?? 'google',
      email:     t.account_email,
      // Never export token values
      scopes:    t.scopes,
      connectedAt: t.created_at,
    })),
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="familydash-export.json"',
      'Cache-Control': 'no-store',
    },
  })
}
