'use client'

import { useState, useEffect, useCallback } from 'react'
import { useConfig } from './ConfigProvider'
import AdminPanel from './AdminPanel'
import CalendarView from './CalendarView'
import ChoresView from './ChoresView'
import WeatherWidget from './WeatherWidget'
import type { Plan } from '@/lib/supabase/types'

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
  userEmail:  string
  userName:   string | null
  familyPlan: Plan
}

const PAGES = ['calendar', 'chores'] as const
type Page = typeof PAGES[number]
type CalView = 'today' | 'week' | 'month'

const PAGE_LABELS: Record<Page, string> = {
  calendar: 'Calendar',
  chores:   'Chores',
}

export default function DashboardClient({ userEmail, userName, familyPlan }: Props) {
  const { config } = useConfig()
  const [page, setPage]             = useState<Page>('calendar')
  const [now, setNow]               = useState(new Date())
  const [calView, setCalView]       = useState<CalView>('week')
  const [viewDate, setViewDate]     = useState(new Date())
  const [events, setEvents]         = useState<CalendarEvent[]>([])
  const [chores, setChores]         = useState<Record<string, Record<string, boolean>>>({})
  const [loadingCal, setLoadingCal] = useState(false)
  const [showAdmin, setShowAdmin]   = useState(false)

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const fetchEvents = useCallback(async () => {
    setLoadingCal(true)
    try {
      let timeMin: Date
      let timeMax: Date

      if (calView === 'today') {
        timeMin = new Date(viewDate); timeMin.setHours(0, 0, 0, 0)
        timeMax = new Date(viewDate); timeMax.setHours(23, 59, 59, 999)
      } else if (calView === 'week') {
        timeMin = new Date(viewDate)
        timeMin.setDate(viewDate.getDate() - ((viewDate.getDay() + 6) % 7))
        timeMin.setHours(0, 0, 0, 0)
        timeMax = new Date(timeMin)
        timeMax.setDate(timeMin.getDate() + 6)
        timeMax.setHours(23, 59, 59, 999)
      } else {
        // Full calendar grid: Mon of week containing 1st → Sun of week containing last
        timeMin = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
        timeMin.setDate(timeMin.getDate() - ((timeMin.getDay() + 6) % 7))
        timeMin.setHours(0, 0, 0, 0)
        timeMax = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)
        timeMax.setDate(timeMax.getDate() + (7 - timeMax.getDay()) % 7)
        timeMax.setHours(23, 59, 59, 999)
      }

      const params = new URLSearchParams({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() })
      const res = await fetch(`/api/calendar?${params}`)
      if (res.ok) setEvents((await res.json()).events ?? [])
    } finally { setLoadingCal(false) }
  }, [calView, viewDate])

  const fetchChores = useCallback(async () => {
    const today = now.toISOString().slice(0, 10)
    const res = await fetch(`/api/chores?date=${today}`)
    if (!res.ok) return
    const data = await res.json()
    const map: Record<string, Record<string, boolean>> = {}
    for (const c of data.completions ?? []) {
      if (!map[c.kid_person_id]) map[c.kid_person_id] = {}
      map[c.kid_person_id][c.chore_id] = true
    }
    setChores(map)
  }, [now])

  useEffect(() => { fetchEvents() }, [fetchEvents])
  useEffect(() => { fetchChores() }, [fetchChores])

  const toggleChore = useCallback(async (kidId: string, choreId: string) => {
    const today      = now.toISOString().slice(0, 10)
    const currentDone = chores[kidId]?.[choreId] ?? false
    const newDone    = !currentDone
    setChores(prev => ({ ...prev, [kidId]: { ...prev[kidId], [choreId]: newDone } }))
    const res = await fetch('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kidPersonId: kidId, choreId, date: today, done: newDone }),
    })
    if (!res.ok) setChores(prev => ({ ...prev, [kidId]: { ...prev[kidId], [choreId]: currentDone } }))
  }, [now, chores])

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-white/10 bg-gray-950/80 px-8 py-3 backdrop-blur">
          <div className="flex flex-col">
            <span className="font-mono text-4xl font-bold leading-none tracking-tight text-white">
              {formatTime(now, config.settings?.use24h)}
            </span>
            <span className="mt-1 text-xs font-medium uppercase tracking-widest text-gray-500">
              {formatDate(now)}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-600">
              {PAGE_LABELS[page]}
            </span>
            <div className="flex gap-2">
              {PAGES.map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={`h-2 w-2 rounded-full transition-all ${page === p ? 'scale-125 bg-blue-400' : 'bg-gray-700'}`}
                  aria-label={PAGE_LABELS[p]} />
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
              events={events} people={config.people} loading={loadingCal}
              now={now} use24h={config.settings?.use24h ?? false}
              calView={calView} viewDate={viewDate}
              onViewChange={v => { setCalView(v); if (v === 'today') setViewDate(new Date()) }}
              onNavigate={dir => setViewDate(d => {
                const next = new Date(d)
                if (calView === 'today') next.setDate(d.getDate() + dir)
                else if (calView === 'week') next.setDate(d.getDate() + dir * 7)
                else next.setMonth(d.getMonth() + dir)
                return next
              })}
              onGoToday={() => setViewDate(new Date())}
            />
          )}
          {page === 'chores' && (
            <ChoresView config={config} completions={chores} onToggle={toggleChore} now={now} />
          )}
        </main>

        {/* Footer */}
        <footer className="flex flex-shrink-0 items-center justify-between border-t border-white/10 bg-gray-950/80 px-6 py-2">
          <span className="text-xs capitalize text-gray-700">{familyPlan} plan</span>
          <button onClick={() => setShowAdmin(true)}
            className="rounded-lg px-3 py-1 text-xs text-gray-600 transition hover:text-gray-400">
            ⚙ Admin
          </button>
        </footer>
      </div>

      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} userEmail={userEmail} familyPlan={familyPlan} />
      )}
    </>
  )
}

function formatTime(d: Date, use24h = false): string {
  if (use24h) return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  const h = d.getHours() % 12 || 12
  return `${h}:${String(d.getMinutes()).padStart(2,'0')}`
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}
