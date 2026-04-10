'use client'

import { useMemo, useState } from 'react'
import type { ConfigJson, Person, ChoreDefinition } from '@/lib/supabase/types'

interface Props {
  config: ConfigJson
  completions: Record<string, Record<string, boolean>> // { kidId: { choreId: true } }
  onToggle: (kidId: string, choreId: string) => void
  onPointsChange: (kidId: string, newPoints: number) => void
  now: Date
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PERIODS = [
  { key: 'morning',   label: 'Morning',   emoji: '🌅', startH:  5, endH: 12 },
  { key: 'afternoon', label: 'Afternoon', emoji: '☀️',  startH: 12, endH: 17 },
  { key: 'evening',   label: 'Evening',   emoji: '🌙', startH: 17, endH: 23 },
  { key: 'anytime',   label: null,        emoji: '',   startH:  0, endH: 24 },
] as const

const PERIOD_ORDER = ['morning', 'afternoon', 'evening', 'anytime']

export default function ChoresView({ config, completions, onToggle, onPointsChange, now }: Props) {
  const kids = config.people.filter(p => p.type === 'kid')
  const dayName = DAY_SHORT[now.getDay()]
  const activePeriod = getActivePeriod(now.getHours())

  if (kids.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <p>No kids set up yet. Add them in the Admin panel.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full gap-4 overflow-hidden p-4">
      {kids.map(kid => (
        <KidColumn
          key={kid.id}
          kid={kid}
          chores={config.chores.filter(c => c.kid_ids.includes(kid.id) && c.days.includes(dayName))}
          completions={completions[kid.id] ?? {}}
          points={config.points[kid.id] ?? 0}
          rewards={config.rewards[kid.id] ?? []}
          activePeriod={activePeriod}
          onToggle={(choreId) => onToggle(kid.id, choreId)}
          onClaim={(rewardId, newPoints) => onPointsChange(kid.id, newPoints)}
        />
      ))}
    </div>
  )
}

function getActivePeriod(hour: number): string | null {
  for (const p of PERIODS) {
    if (p.key !== 'anytime' && hour >= p.startH && hour < p.endH) return p.key
  }
  return null
}

// ── Kid Column ─────────────────────────────────────────────────

interface KidColProps {
  kid: Person
  chores: ChoreDefinition[]
  completions: Record<string, boolean>
  points: number
  rewards: ConfigJson['rewards'][string]
  activePeriod: string | null
  onToggle: (choreId: string) => void
  onClaim: (rewardId: string, newPoints: number) => void
}

function KidColumn({ kid, chores, completions, points, rewards, activePeriod, onToggle, onClaim }: KidColProps) {
  const sorted = useMemo(
    () => [...chores].sort((a, b) =>
      PERIOD_ORDER.indexOf(a.period ?? 'anytime') - PERIOD_ORDER.indexOf(b.period ?? 'anytime')
    ),
    [chores]
  )

  const doneCount = chores.filter(c => completions[c.id]).length
  const allDone   = chores.length > 0 && doneCount === chores.length
  const pct       = chores.length ? Math.round((doneCount / chores.length) * 100) : 0

  return (
    <div
      className="flex flex-1 flex-col gap-3 min-w-0"
      style={{ position: 'relative' }}
    >
      {/* Header */}
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
        <span className="text-xl font-bold" style={{ color: kid.color }}>
          {kid.name}
        </span>
        <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-0.5 text-xs font-bold text-yellow-400">
          ⭐ {points} pts
        </span>
        <span className="text-sm text-gray-500">{doneCount} / {chores.length} done</span>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: kid.color }}
          />
        </div>
      </div>

      {/* Chore list */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-600">No chores today!</p>
        ) : (
          (() => {
            let lastPeriod: string | null = null
            return sorted.map(chore => {
              const period  = chore.period ?? 'anytime'
              const meta    = PERIODS.find(p => p.key === period)
              const showDiv = period !== 'anytime' && period !== lastPeriod
              if (period !== 'anytime') lastPeriod = period

              const done    = !!completions[chore.id]
              const isActive = period === activePeriod || period === 'anytime'
              const pts     = chore.points ?? 0

              return (
                <div key={chore.id}>
                  {showDiv && (
                    <div
                      className={`mb-1 flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-widest ${
                        period === activePeriod ? 'text-blue-400' : 'text-gray-600'
                      }`}
                    >
                      <span>{meta?.emoji} {meta?.label}</span>
                    </div>
                  )}
                  <button
                    onClick={() => onToggle(chore.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all active:scale-[0.98] ${
                      done
                        ? 'border-green-500/25 bg-green-500/7'
                        : 'border-white/10 bg-white/5'
                    } ${isActive ? '' : 'opacity-40 hover:opacity-70'}`}
                  >
                    {/* Checkbox */}
                    <span
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 text-sm transition-all ${
                        done
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-white/20'
                      }`}
                    >
                      {done ? '✓' : ''}
                    </span>

                    {/* Task name */}
                    <span
                      className={`flex-1 font-semibold transition-colors ${
                        done ? 'text-gray-500 line-through' : 'text-white'
                      }`}
                    >
                      {chore.task}
                    </span>

                    {/* Points badge */}
                    {pts > 0 && (
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-bold transition-colors ${
                          done
                            ? 'bg-yellow-500/15 text-yellow-400'
                            : 'bg-white/10 text-gray-500'
                        }`}
                      >
                        ⭐ {pts}
                      </span>
                    )}
                  </button>
                </div>
              )
            })
          })()
        )}
      </div>

      {/* Rewards panel */}
      {rewards.length > 0 && (
        <RewardsPanel kidPersonId={kid.id} rewards={rewards} points={points} onClaim={onClaim} />
      )}

      {/* All done celebration */}
      {allDone && chores.length > 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-gray-950/80 backdrop-blur-sm">
          <span className="text-5xl">🎉</span>
          <span className="text-xl font-bold text-white">Amazing, {kid.name}!</span>
          <span className="text-sm text-gray-400">All done for today!</span>
        </div>
      )}
    </div>
  )
}

// ── Rewards Panel ──────────────────────────────────────────────

function RewardsPanel({
  kidPersonId,
  rewards,
  points,
  onClaim,
}: {
  kidPersonId: string
  rewards: Array<{ id: string; name: string; emoji: string; points: number }>
  points: number
  onClaim: (rewardId: string, newPoints: number) => void
}) {
  const [claiming, setClaiming] = useState<string | null>(null)
  const [claimed,  setClaimed]  = useState<string | null>(null)

  async function handleClaim(rewardId: string) {
    setClaiming(rewardId)
    try {
      const res = await fetch('/api/rewards/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kidPersonId, rewardId }),
      })
      if (res.ok) {
        const { newPoints } = await res.json()
        onClaim(rewardId, newPoints)
        setClaimed(rewardId)
        setTimeout(() => setClaimed(null), 2500)
      }
    } finally {
      setClaiming(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
      <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
        🏆 Rewards
      </span>
      {rewards.map(reward => {
        const canClaim   = points >= reward.points
        const isClaiming = claiming === reward.id
        const isClaimed  = claimed  === reward.id
        return (
          <div
            key={reward.id}
            className={`flex items-center gap-2 rounded-xl border p-2 transition-all ${
              isClaimed
                ? 'border-green-500/30 bg-green-500/5'
                : canClaim
                ? 'border-yellow-500/30 bg-yellow-500/5'
                : 'border-white/5 bg-transparent'
            }`}
          >
            <span className="text-xl">{reward.emoji || '🎁'}</span>
            <div className="flex flex-1 flex-col gap-0.5 min-w-0">
              <span className="truncate text-sm font-semibold text-white">{reward.name}</span>
              <span className="text-xs text-gray-500">⭐ {reward.points} pts</span>
            </div>
            <button
              disabled={!canClaim || isClaiming}
              onClick={() => handleClaim(reward.id)}
              className={`flex-shrink-0 rounded-lg px-3 py-1 text-xs font-bold transition-all active:scale-95 ${
                isClaimed
                  ? 'bg-green-500/20 text-green-400'
                  : canClaim
                  ? 'bg-yellow-500 text-gray-900 hover:bg-yellow-400 disabled:opacity-60'
                  : 'cursor-default bg-white/10 text-gray-600'
              }`}
            >
              {isClaimed ? '✓ Claimed!' : isClaiming ? '…' : canClaim ? 'Claim!' : `${reward.points - points} more`}
            </button>
          </div>
        )
      })}
    </div>
  )
}
