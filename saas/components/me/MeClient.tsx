'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, MapPin, Settings } from 'lucide-react'
import type { CalendarEvent, Person, Plan } from '@/lib/supabase/types'
import MePreferences from './MePreferences'

interface Props {
  userName:     string | null
  userEmail:    string
  userPersonId: string | null
  people:       Person[]
  use24h:       boolean
  familyPlan:   Plan
}

const LOOK_AHEAD_DAYS = 7

export default function MeClient({ userName, userEmail, userPersonId, people, use24h, familyPlan }: Props) {
  const [events, setEvents]   = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showPrefs, setShowPrefs] = useState(false)

  const personById = useMemo(
    () => new Map(people.map(p => [p.id, p] as const)),
    [people]
  )

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const now      = new Date()
    const timeMin  = new Date(now); timeMin.setHours(0, 0, 0, 0)
    const timeMax  = new Date(now)
    timeMax.setDate(timeMax.getDate() + LOOK_AHEAD_DAYS)
    timeMax.setHours(23, 59, 59, 999)

    try {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
      })
      const res = await fetch(`/api/calendar?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEvents((data.events as CalendarEvent[]) ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // Pre-register the service worker so the user sees "Push: On" pick-up
  // immediately if they already subscribed on this device. Safe on every
  // visit — registering an already-registered worker is a no-op.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* ignored */ })
    }
  }, [])

  const mine = userPersonId
    ? events
        .filter(e =>
          e.responsiblePersonIds.includes(userPersonId) ||
          e.attendeePersonIds.includes(userPersonId)
        )
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    : []

  const groups = groupByDay(mine)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-gray-950/90 px-4 py-3 backdrop-blur">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <div className="text-sm font-semibold">{userName ?? userEmail}</div>
        <button
          onClick={() => setShowPrefs(true)}
          className="rounded-md p-1.5 text-gray-500 hover:bg-white/5 hover:text-white"
          aria-label="Preferences"
        >
          <Settings className="h-4 w-4" />
        </button>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-lg px-4 py-5">
        {!userPersonId && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm">
            <p className="font-semibold text-amber-200">Link yourself first</p>
            <p className="mt-1 text-xs text-amber-300/80">
              Open <Link className="underline" href="/dashboard">the dashboard</Link>,
              tap Admin, then pick which person in your family you are.
            </p>
          </div>
        )}

        {loading && <p className="text-xs text-gray-500">Loading…</p>}

        {!loading && userPersonId && mine.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-gray-500">
            <CalendarDays className="h-10 w-10 opacity-50" />
            <p className="text-sm">Nothing on your plate for the next {LOOK_AHEAD_DAYS} days.</p>
            <p className="text-xs">Tag yourself on an event from the dashboard to see it here.</p>
          </div>
        )}

        {groups.map(group => (
          <section key={group.key} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
              {group.label}
            </h2>
            <div className="space-y-2">
              {group.events.map(ev => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  personById={personById}
                  userPersonId={userPersonId!}
                  use24h={use24h}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {showPrefs && (
        <MePreferences
          people={people}
          initialPersonId={userPersonId}
          familyPlan={familyPlan}
          onClose={() => setShowPrefs(false)}
        />
      )}
    </div>
  )
}

// ── Event row ─────────────────────────────────────────────────

function EventRow({ event, personById, userPersonId, use24h }: {
  event:        CalendarEvent
  personById:   Map<string, Person>
  userPersonId: string
  use24h:       boolean
}) {
  const isResponsible = event.responsiblePersonIds.includes(userPersonId)
  const start    = new Date(event.start)
  const timeText = event.allDay ? 'All day' : formatTime(start, use24h)

  const attendeesOtherThanMe = event.attendeePersonIds.filter(id => id !== userPersonId)

  return (
    <div
      className="relative rounded-xl border border-white/10 bg-white/5 p-3"
      style={{ borderLeft: `3px solid ${event.color}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{timeText}</span>
            {isResponsible && (
              <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-200">
                You&rsquo;re on
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-white">
            {event.title}
          </div>
          {event.location && (
            <div className="mt-1 flex items-center gap-1 truncate text-xs text-gray-500">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
          {attendeesOtherThanMe.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {attendeesOtherThanMe.map(id => {
                const p = personById.get(id)
                if (!p) return null
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    style={{ background: p.color + '40', color: p.color }}
                  >
                    {p.name}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Grouping ──────────────────────────────────────────────────

function groupByDay(events: CalendarEvent[]) {
  const groups = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const key = dayKey(new Date(e.start))
    const list = groups.get(key) ?? []
    list.push(e)
    groups.set(key, list)
  }
  return Array.from(groups.entries()).map(([key, evs]) => ({
    key,
    label: dayLabel(key),
    events: evs,
  }))
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)

  if (dayKey(day) === dayKey(today))    return 'Today'
  if (dayKey(day) === dayKey(tomorrow)) return 'Tomorrow'
  return day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function formatTime(d: Date, use24h: boolean): string {
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  if (use24h) return `${String(h).padStart(2, '0')}:${m}`
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`
}
