import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { kidPersonId, rewardId } = await req.json()
  if (!kidPersonId || !rewardId) {
    return NextResponse.json({ error: 'kidPersonId and rewardId required' }, { status: 400 })
  }

  const supabase = await createClient()

  // Resolve family
  const { data: user } = await supabase
    .from('users')
    .select('family_id')
    .eq('email', session.user.email)
    .single()
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: fc } = await supabase
    .from('family_config')
    .select('id, config_json')
    .eq('family_id', user.family_id)
    .single()
  if (!fc) return NextResponse.json({ error: 'Config not found' }, { status: 404 })

  const config = fc.config_json

  // Find reward
  const kidRewards: Array<{ id: string; name: string; points: number }> = config.rewards?.[kidPersonId] ?? []
  const reward = kidRewards.find((r: { id: string }) => r.id === rewardId)
  if (!reward) return NextResponse.json({ error: 'Reward not found' }, { status: 404 })

  // Check points
  const currentPoints: number = config.points?.[kidPersonId] ?? 0
  if (currentPoints < reward.points) {
    return NextResponse.json({ error: 'Not enough points' }, { status: 400 })
  }

  // Deduct points
  const newPoints = currentPoints - reward.points
  const updatedConfig = {
    ...config,
    points: { ...config.points, [kidPersonId]: newPoints },
  }

  const { error } = await supabase
    .from('family_config')
    .update({ config_json: updatedConfig })
    .eq('id', fc.id)

  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })

  return NextResponse.json({ ok: true, newPoints })
}
