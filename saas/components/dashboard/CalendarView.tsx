'use client'

import { useMemo, useEffect, useRef } from 'react'
import type { Person } from '@/lib/supabase/types'
import type { CalendarEvent } from './DashboardClient'

type CalView = 'today' | 'week' | 'month'

interface Props {
  events:        CalendarEvent[]
  people:        Person[]
  loading:       boolean
  now:           Date
  use24h:        boolean
  calView:       CalView
  viewDate:      Date
  portrait:      boolean
  onViewChange:  (v: CalView) => void
  onNavigate:    (dir: -1 | 1) => void
  onGoToday:     () => void
}

const DAY_NAMES  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS      = Array.from({ length: 24 }, (_, i) => i)
const ROW_HEIGHT = 56 // px per hour

// ── Shared helpers ─────────────────────────────────────────────

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

function getWeekDays(anchor: Date): Date[] {
  const days: Date[] = []
  const mon = new Date(anchor)
  mon.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7))
  mon.setHours(0, 0, 0, 0)
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    days.push(d)
  }
  return days
}

function viewTitle(calView: CalView, viewDate: Date): string {
  if (calView === 'today') {
    return viewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }
  if (calView === 'week') {
    const days = getWeekDays(viewDate)
    const first = days[0], last = days[6]
    const mo = first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const dy = last.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const yr = last.getFullYear()
    return `${mo} – ${dy}, ${yr}`
  }
  return viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/**
 * Assigns column layout to overlapping events so they sit side-by-side.
 */
function layoutDayEvents(events: CalendarEvent[]) {
  if (events.length === 0) return []

  const seen = new Set<string>()
  const unique = events.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true })

  const sorted = [...unique].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  )

  type Positioned = CalendarEvent & { col: number; totalCols: number }
  const positioned: Positioned[] = []
  const colEnds: number[] = []

  for (const ev of sorted) {
    const evStart = new Date(ev.start).getTime()
    const evEnd   = new Date(ev.end).getTime()
    let col = colEnds.findIndex(end => end <= evStart)
    if (col === -1) { col = colEnds.length; colEnds.push(evEnd) }
    else colEnds[col] = evEnd
    positioned.push({ ...ev, col, totalCols: 0 })
  }

  for (const ev of positioned) {
    const s = new Date(ev.start).getTime()
    const e = new Date(ev.end).getTime()
    const overlapping = positioned.filter(o => new Date(o.start).getTime() < e && new Date(o.end).getTime() > s)
    ev.totalCols = Math.max(...overlapping.map(o => o.col)) + 1
  }

  return positioned
}

// ── Root component ─────────────────────────────────────────────

export default function CalendarView({ events, people, loading, now, use24h, calView, viewDate, portrait, onViewChange, onNavigate, onGoToday }: Props) {
  const todayStr = isoDate(now)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* View controls */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 px-4 py-2">
        <div className="flex items-center gap-1">
          <button onClick={() => onNavigate(-1)}
            className="rounded-lg px-2 py-1 text-gray-500 hover:bg-white/5 hover:text-white">‹</button>
          <button onClick={() => onNavigate(1)}
            className="rounded-lg px-2 py-1 text-gray-500 hover:bg-white/5 hover:text-white">›</button>
          <button onClick={onGoToday}
            className="ml-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-gray-400 hover:bg-white/5 hover:text-white">
            Today
          </button>
          <span className="ml-3 text-sm font-semibold text-white">{viewTitle(calView, viewDate)}</span>
        </div>

        {/* Hide week/month tabs in portrait — single-day is the only usable view */}
        {!portrait && (
          <div className="flex gap-0.5 rounded-lg border border-white/10 p-0.5">
            {(['today', 'week', 'month'] as CalView[]).map(v => (
              <button key={v} onClick={() => onViewChange(v)}
                className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition ${
                  calView === v ? 'bg-white/15 text-white ring-1 ring-white/20' : 'text-gray-500 hover:text-white'
                }`}>
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex-shrink-0 px-4 py-1 text-xs text-gray-600">Loading events…</div>
      )}

      {calView === 'month'
        ? <MonthView events={events} viewDate={viewDate} todayStr={todayStr} />
        : <TimeGrid
            days={calView === 'today' ? [viewDate] : getWeekDays(viewDate)}
            events={events} now={now} todayStr={todayStr} use24h={use24h}
          />
      }
    </div>
  )
}

// ── Time grid (Today + Week) ───────────────────────────────────

function TimeGrid({ days, events, now, todayStr, use24h }: {
  days:     Date[]
  events:   CalendarEvent[]
  now:      Date
  todayStr: string
  use24h:   boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const allDay  = events.filter(e => e.allDay)
  const timed   = events.filter(e => !e.allDay)

  // Scroll to current hour on mount
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const target = (now.getHours() - 1) * ROW_HEIGHT
    el.scrollTop = Math.max(0, target)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Day header */}
      <div className="flex flex-shrink-0 border-b border-white/10">
        <div className="w-14 flex-shrink-0" />
        {days.map(day => {
          const isToday = isoDate(day) === todayStr
          return (
            <div key={isoDate(day)} className="flex flex-1 flex-col items-center py-2">
              <span className={`text-xs font-medium uppercase tracking-wider ${isToday ? 'text-white' : 'text-gray-500'}`}>
                {DAY_NAMES[day.getDay()]}
              </span>
              <span className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${isToday ? 'bg-white text-slate-900' : 'text-white'}`}>
                {day.getDate()}
              </span>
            </div>
          )
        })}
      </div>

      {/* All-day row */}
      {allDay.length > 0 && (
        <div className="flex flex-shrink-0 border-b border-white/10 py-1">
          <div className="w-14 flex-shrink-0 pr-2 pt-1 text-right text-xs text-gray-600">all day</div>
          <div className="flex flex-1">
            {days.map(day => {
              const ds = isoDate(day)
              const dayEvs = allDay.filter(e => e.start.slice(0, 10) <= ds && e.end.slice(0, 10) > ds)
              return (
                <div key={ds} className="flex-1 px-0.5">
                  {dayEvs.map(ev => (
                    <div key={ev.id}
                      className="mb-0.5 truncate rounded px-1 py-0.5 text-xs font-medium"
                      style={{ background: ev.color + '33', color: ev.color, borderLeft: `2px solid ${ev.color}` }}
                      title={`${ev.personName} – ${ev.title}`}>
                      {ev.personName ? `${ev.personName} – ` : ''}{ev.title}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ minHeight: `${24 * ROW_HEIGHT}px` }}>
          {/* Hour gutter */}
          <div className="w-14 flex-shrink-0">
            {HOURS.map(h => (
              <div key={h} className="relative" style={{ height: ROW_HEIGHT }}>
                <span className="absolute -top-2 right-2 text-xs text-gray-600">
                  {formatHour(h, use24h)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(day => {
            const ds = isoDate(day)
            const isToday = ds === todayStr
            const dayEvents = timed.filter(e => e.start.slice(0, 10) === ds)

            return (
              <div key={ds}
                className={`relative flex-1 border-l border-white/5 ${isToday ? 'bg-white/[0.02]' : ''}`}
                style={{ minHeight: `${24 * ROW_HEIGHT}px` }}>
                {HOURS.map(h => (
                  <div key={h} className="absolute w-full border-t border-white/5" style={{ top: h * ROW_HEIGHT }} />
                ))}

                {/* Current time indicator */}
                {isToday && (
                  <div className="absolute z-10 w-full"
                    style={{ top: (now.getHours() + now.getMinutes() / 60) * ROW_HEIGHT }}>
                    <div className="relative">
                      <div className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white/80" />
                      <div className="h-px bg-white/40" />
                    </div>
                  </div>
                )}

                {layoutDayEvents(dayEvents).map(ev => {
                  const start  = new Date(ev.start)
                  const end    = new Date(ev.end)
                  const top    = (start.getHours() + start.getMinutes() / 60) * ROW_HEIGHT
                  const height = Math.max(((end.getTime() - start.getTime()) / 3_600_000) * ROW_HEIGHT, 20)
                  const pct    = 100 / ev.totalCols
                  return (
                    <div key={ev.id}
                      className="absolute overflow-hidden rounded-md px-1.5 py-1 text-xs"
                      style={{
                        top, height,
                        left:       `calc(${ev.col * pct}% + 2px)`,
                        width:      `calc(${pct}% - 4px)`,
                        background: ev.color + '33',
                        borderLeft: `3px solid ${ev.color}`,
                        color:      ev.color,
                      }}
                      title={`${ev.personName} – ${ev.title}`}>
                      {ev.personName && <span className="font-bold">{ev.personName} – </span>}
                      <span>{ev.title}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Month grid ─────────────────────────────────────────────────

function MonthView({ events, viewDate, todayStr }: {
  events:   CalendarEvent[]
  viewDate: Date
  todayStr: string
}) {
  const cells = useMemo(() => {
    // Build 6-week grid starting from the Monday of the week containing the 1st
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
    const start = new Date(first)
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
    start.setHours(0, 0, 0, 0)

    const days: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      days.push(d)
    }
    return days
  }, [viewDate])

  const currentMonth = viewDate.getMonth()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Day-name header */}
      <div className="flex flex-shrink-0 border-b border-white/10">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
          <div key={d} className="flex-1 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-600">
            {d}
          </div>
        ))}
      </div>

      {/* 6 × 7 grid */}
      <div className="grid flex-1 overflow-y-auto" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(6, 1fr)' }}>
        {cells.map(day => {
          const ds         = isoDate(day)
          const isToday    = ds === todayStr
          const inMonth    = day.getMonth() === currentMonth
          const dayEvents  = events.filter(e => {
            if (e.allDay) return e.start.slice(0, 10) <= ds && e.end.slice(0, 10) > ds
            return e.start.slice(0, 10) === ds
          })

          // Deduplicate
          const seen = new Set<string>()
          const unique = dayEvents.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true })

          return (
            <div key={ds}
              className={`min-h-0 border-b border-r border-white/5 p-1 ${inMonth ? '' : 'opacity-30'}`}>
              <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                isToday ? 'bg-white text-slate-900' : 'text-gray-400'
              }`}>
                {day.getDate()}
              </div>

              <div className="space-y-0.5">
                {unique.slice(0, 3).map(ev => (
                  <div key={ev.id}
                    className="truncate rounded px-1 py-0.5 text-xs leading-tight"
                    style={{ background: ev.color + '28', color: ev.color, borderLeft: `2px solid ${ev.color}` }}
                    title={`${ev.personName} – ${ev.title}`}>
                    {ev.personName ? `${ev.personName.split(' ')[0]} – ` : ''}{ev.title}
                  </div>
                ))}
                {unique.length > 3 && (
                  <div className="pl-1 text-xs text-gray-600">+{unique.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Utils ──────────────────────────────────────────────────────

function formatHour(h: number, use24h: boolean): string {
  if (use24h) return h === 0 ? '' : `${String(h).padStart(2, '0')}:00`
  if (h === 0) return ''
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}
