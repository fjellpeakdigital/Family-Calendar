'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ConfigJson } from '@/lib/supabase/types'
import CalendarView from './CalendarView'
import ChoresView from './ChoresView'
import WeatherWidget from './WeatherWidget'

// Re-export CalendarEvent shape for children
export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  calendarId: string
  personId: string
  personName: string
  color: string
}

interface Props {
  initialConfig: ConfigJson
  userEmail: string
  userName: string | null
}

const PAGES = ['calendar', 'chores'] as const
type Page = typeof PAGES[number]

const PAGE_LABELS: Record<Page, string> = {
  calendar: 'Calendar',
  chores:   'Chores',
}

export default function DashboardClient({ initialConfig, userEmail, userName }: Props) {
  const [config, setConfig]   = useState<ConfigJson>(initialConfig)
  const [page, setPage]       = useState<Page>('calendar')
  const [now, setNow]         = useState(new Date())
  const [events, setEvents]   = useState<CalendarEvent[]>([])
  const [chores, setChores]   = useState<Record<string, Record<string, boolean>>>({})
  const [loadingCal, setLoadingCal] = useState(false)

  // Clock — updates every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch calendar events for the current week
  const fetchEvents = useCallback(async () => {
    setLoadingCal(true)
    try {
      const today  = new Date()
      const monday = new Date(today)
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
      monday.setHours(0, 0, 0, 0)

      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)

      const params = new URLSearchParams({
        timeMin: monday.toISOString(),
        timeMax: sunday.toISOString(),
      })

      const res = await fetch(`/api/calendar?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events ?? [])
      }
    } finally {
      setLoadingCal(false)
    }
  }, [])

  // Fetch today's chore completions
  const fetchChores = useCallback(async () => {
    const today = now.toISOString().slice(0, 10)
    const res = await fetch(`/api/chores?date=${today}`)
    if (!res.ok) return

    const data = await res.json()
    // Build a map: { kidId: { choreId: true } }
    const map: Record<string, Record<string, boolean>> = {}
    for (const c of data.completions ?? []) {
      if (!map[c.kid_person_id]) map[c.kid_person_id] = {}
      map[c.kid_person_id][c.chore_id] = true
    }
    setChores(map)
  }, [now])

  useEffect(() => { fetchEvents() }, [fetchEvents])
  useEffect(() => { fetchChores() }, [fetchChores])

  // Toggle a chore — optimistic update, then sync to server
  const toggleChore = useCallback(async (kidId: string, choreId: string) => {
    const today = now.toISOString().slice(0, 10)
    const currentDone = chores[kidId]?.[choreId] ?? false
    const newDone = !currentDone

    // Optimistic
    setChores(prev => ({
      ...prev,
      [kidId]: { ...prev[kidId], [choreId]: newDone },
    }))

    const res = await fetch('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kidPersonId: kidId, choreId, date: today, done: newDone }),
    })

    if (!res.ok) {
      // Revert on failure
      setChores(prev => ({
        ...prev,
        [kidId]: { ...prev[kidId], [choreId]: currentDone },
      }))
    }
  }, [now, chores])

  const formattedTime = formatTime(now, config.settings?.use24h)
  const formattedDate = formatDate(now)

  return (
    <div className="flex h-full flex-col overflow-hidden" data-theme={config.settings?.theme ?? 'dark'}>
      {/* Header */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-white/10 bg-gray-950/80 px-8 py-3 backdrop-blur">
        <div className="flex flex-col">
          <span className="font-mono text-4xl font-bold leading-none tracking-tight text-white">
            {formattedTime}
          </span>
          <span className="mt-1 text-xs font-medium uppercase tracking-widest text-gray-500">
            {formattedDate}
          </span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-600">
            {PAGE_LABELS[page]}
          </span>
          <div className="flex gap-2">
            {PAGES.map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`h-2 w-2 rounded-full transition-all ${
                  page === p ? 'scale-125 bg-blue-400' : 'bg-gray-700'
                }`}
                aria-label={PAGE_LABELS[p]}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <WeatherWidget location={config.settings?.location ?? ''} />
          <span className="text-xs text-gray-600">{userName ?? userEmail}</span>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-hidden">
        {page === 'calendar' && (
          <CalendarView
            events={events}
            people={config.people}
            loading={loadingCal}
            now={now}
            use24h={config.settings?.use24h ?? false}
          />
        )}
        {page === 'chores' && (
          <ChoresView
            config={config}
            completions={chores}
            onToggle={toggleChore}
            now={now}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="flex flex-shrink-0 items-center justify-end border-t border-white/10 bg-gray-950/80 px-6 py-2">
        <button
          onClick={() => {/* Admin panel — Phase 2 */}}
          className="rounded-lg px-3 py-1 text-xs text-gray-600 transition hover:text-gray-400"
        >
          ⚙ Admin
        </button>
      </footer>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────

function formatTime(d: Date, use24h = false): string {
  if (use24h) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const h = d.getHours() % 12 || 12
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}
