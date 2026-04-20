'use client'

import { useMemo, useEffect, useRef, useSyncExternalStore } from 'react'
import type { CalendarEvent, Person } from '@/lib/supabase/types'

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
  mineOnly:      boolean
  mineAvailable: boolean
  onToggleMine:  () => void
  onViewChange:  (v: CalView) => void
  onNavigate:    (dir: -1 | 1) => void
  onGoToday:     () => void
  onEventClick?: (event: CalendarEvent) => void
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS     = Array.from({ length: 24 }, (_, i) => i)

/**
 * Responsive hour-row height. Phones stay compact; tablets and up get
 * meaningfully taller rows so events aren't crushed. JS positioning
 * math has to use the same value the CSS renders, so we track it in
 * state and recompute on resize.
 */
const ROW_HEIGHT_PHONE  = 56
const ROW_HEIGHT_TABLET = 72
const ROW_HEIGHT_DESKTOP = 88

function subscribeToResize(cb: () => void): () => void {
  window.addEventListener('resize', cb)
  return () => window.removeEventListener('resize', cb)
}

function snapshotRowHeight(): number {
  const w = window.innerWidth
  if (w >= 1280) return ROW_HEIGHT_DESKTOP
  if (w >= 768)  return ROW_HEIGHT_TABLET
  return ROW_HEIGHT_PHONE
}

/** Track the hour-row height as a reactive value. On the server we
 *  return the phone default — hydration then switches to the real
 *  viewport-sized height on mount without a cascading render. */
function useRowHeight(): number {
  return useSyncExternalStore(
    subscribeToResize,
    snapshotRowHeight,
    () => ROW_HEIGHT_PHONE,
  )
}

// ── Shared helpers ─────────────────────────────────────────────

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

function getWeekDays(anchor: Date): Date[] {
  const days: Date[] = []
  const start = new Date(anchor)
  // Sunday-first week (US convention). Date.getDay() already returns
  // 0 for Sunday, so subtracting it lands on the previous Sunday.
  start.setDate(anchor.getDate() - anchor.getDay())
  start.setHours(0, 0, 0, 0)
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
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
 * Small stacked avatar row. Used inline on event tiles when the event
 * has more than one attendee — replaces the single-person name prefix.
 */
function AttendeeAvatars({ ids, personById, size }: {
  ids:        string[]
  personById: Map<string, Person>
  size:       number
}) {
  if (ids.length <= 1) return null
  const shown = ids.slice(0, 4)
  const extra = Math.max(0, ids.length - shown.length)
  const fs = Math.max(8, Math.round(size * 0.55))
  return (
    <span className="mr-1 inline-flex flex-shrink-0 align-middle" aria-label="Attendees">
      {shown.map((id, i) => {
        const p = personById.get(id)
        const bg = p?.color ?? '#4b5563'
        const initial = (p?.name ?? '?').charAt(0).toUpperCase()
        return (
          <span key={id}
            className="inline-flex items-center justify-center rounded-full border border-gray-900 font-bold text-white"
            style={{ width: size, height: size, background: bg, fontSize: fs, marginLeft: i === 0 ? 0 : -size * 0.25 }}
            title={p?.name ?? ''}
          >
            {initial}
          </span>
        )
      })}
      {extra > 0 && (
        <span className="ml-0.5 inline-flex items-center justify-center rounded-full border border-gray-900 bg-gray-700 font-bold text-gray-200"
          style={{ width: size, height: size, fontSize: fs }}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}

/**
 * Small top-right badge showing responsible adult(s). Rendered inside
 * a relatively/absolutely-positioned tile. Only shown when responsible
 * is non-empty.
 */
function ResponsibilityBadge({ ids, personById, size }: {
  ids:        string[]
  personById: Map<string, Person>
  size:       number
}) {
  if (ids.length === 0) return null
  const first = personById.get(ids[0])
  const bg = first?.color ?? '#4b5563'
  const initial = (first?.name ?? '?').charAt(0).toUpperCase()
  const fs = Math.max(8, Math.round(size * 0.55))
  const extra = ids.length - 1
  return (
    <span
      className="absolute right-0.5 top-0.5 inline-flex items-center gap-0.5 rounded-full px-0.5 py-0.5 text-white"
      style={{ background: 'rgba(0,0,0,0.35)' }}
      title={`Responsible: ${ids.map(id => personById.get(id)?.name ?? '').filter(Boolean).join(', ')}`}
    >
      <span
        className="inline-flex items-center justify-center rounded-full font-bold"
        style={{ width: size, height: size, background: bg, fontSize: fs }}
      >
        {initial}
      </span>
      {extra > 0 && <span className="pr-0.5 text-[9px] font-bold">+{extra}</span>}
    </span>
  )
}

/**
 * Per-tile color: keep the source person's color when there is a single
 * attendee (today's behavior). Fall back to a neutral tint when the
 * event has multiple attendees so the stacked avatars carry identity.
 */
function tileAccent(ev: CalendarEvent): string {
  return ev.attendeePersonIds.length > 1 ? '#64748b' : ev.color
}

/**
 * Single-event cell in the month grid. Used for both the mobile
 * (capped at 3) and tablet+ (capped at 5) lists via className gating.
 */
function MonthTile({ ev, personById, onEventClick, className }: {
  ev:            CalendarEvent
  personById:    Map<string, Person>
  onEventClick?: (event: CalendarEvent) => void
  className?:    string
}) {
  const accent = tileAccent(ev)
  const multi  = ev.attendeePersonIds.length > 1
  return (
    <div
      onClick={() => onEventClick?.(ev)}
      role={onEventClick ? 'button' : undefined}
      className={`relative flex items-center truncate rounded px-1 md:px-1.5 py-0.5 md:py-1 text-xs md:text-sm leading-tight ${onEventClick ? 'cursor-pointer hover:brightness-125' : ''} ${className ?? ''}`}
      style={{ background: accent + '28', color: accent, borderLeft: `2px solid ${accent}` }}
      title={`${ev.personName} – ${ev.title}`}
    >
      {multi
        ? <AttendeeAvatars ids={ev.attendeePersonIds} personById={personById} size={10} />
        : (ev.personName ? <span className="truncate">{ev.personName.split(' ')[0]} – </span> : null)}
      <span className="truncate">{ev.title}</span>
    </div>
  )
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

export default function CalendarView({ events, people, loading, now, use24h, calView, viewDate, portrait, mineOnly, mineAvailable, onToggleMine, onViewChange, onNavigate, onGoToday, onEventClick }: Props) {
  const todayStr = isoDate(now)
  const personById = useMemo(
    () => new Map(people.map(p => [p.id, p] as const)),
    [people]
  )

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

        <div className="flex items-center gap-2">
          {mineAvailable && (
            <button
              onClick={onToggleMine}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                mineOnly
                  ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40'
                  : 'text-gray-500 hover:bg-white/5 hover:text-white'
              }`}
              title={mineOnly ? 'Showing only events that involve you' : 'Show only events that involve you'}
            >
              Mine
            </button>
          )}

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
      </div>

      {loading && (
        <div className="flex-shrink-0 px-4 py-1 text-xs text-gray-600">Loading events…</div>
      )}

      {calView === 'month'
        ? <MonthView events={events} viewDate={viewDate} todayStr={todayStr} personById={personById} onEventClick={onEventClick} />
        : <TimeGrid
            days={calView === 'today' ? [viewDate] : getWeekDays(viewDate)}
            events={events} now={now} todayStr={todayStr} use24h={use24h}
            personById={personById} onEventClick={onEventClick}
          />
      }
    </div>
  )
}

// ── Time grid (Today + Week) ───────────────────────────────────

function TimeGrid({ days, events, now, todayStr, use24h, personById, onEventClick }: {
  days:         Date[]
  events:       CalendarEvent[]
  now:          Date
  todayStr:     string
  use24h:       boolean
  personById:   Map<string, Person>
  onEventClick?: (event: CalendarEvent) => void
}) {
  const rowHeight = useRowHeight()
  const scrollRef = useRef<HTMLDivElement>(null)
  const allDay  = events.filter(e => e.allDay)
  const timed   = events.filter(e => !e.allDay)

  // Scroll to current hour on mount (and whenever rowHeight changes,
  // because the absolute scroll position is in px).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const target = (now.getHours() - 1) * rowHeight
    el.scrollTop = Math.max(0, target)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length, rowHeight])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Day header */}
      <div className="flex flex-shrink-0 border-b border-white/10">
        <div className="w-14 flex-shrink-0 md:w-12" />
        {days.map(day => {
          const isToday = isoDate(day) === todayStr
          return (
            <div key={isoDate(day)} className="flex flex-1 flex-col items-center py-2 md:py-3">
              <span className={`text-xs md:text-sm font-semibold uppercase tracking-wider ${isToday ? 'text-sky-300' : 'text-gray-500'}`}>
                {DAY_NAMES[day.getDay()]}
              </span>
              <span className={`mt-1 flex h-7 w-7 md:h-9 md:w-9 items-center justify-center rounded-full text-sm md:text-base font-bold ${isToday ? 'bg-sky-500/25 text-sky-100 ring-1 ring-sky-400/40' : 'text-white'}`}>
                {day.getDate()}
              </span>
            </div>
          )
        })}
      </div>

      {/* All-day row */}
      {allDay.length > 0 && (
        <div className="flex flex-shrink-0 border-b border-white/10 py-1 md:py-1.5">
          <div className="w-14 flex-shrink-0 pr-2 pt-1 text-right text-xs md:text-sm md:w-12 text-gray-600">all day</div>
          <div className="flex flex-1">
            {days.map(day => {
              const ds = isoDate(day)
              const dayEvs = allDay.filter(e => e.start.slice(0, 10) <= ds && e.end.slice(0, 10) > ds)
              return (
                <div key={ds} className="flex-1 px-0.5">
                  {dayEvs.map(ev => {
                    const accent     = tileAccent(ev)
                    const multi      = ev.attendeePersonIds.length > 1
                    return (
                      <div key={ev.id}
                        onClick={() => onEventClick?.(ev)}
                        role={onEventClick ? 'button' : undefined}
                        className={`relative mb-0.5 flex items-center truncate rounded px-1 py-0.5 md:py-1 text-xs md:text-sm font-medium ${onEventClick ? 'cursor-pointer hover:brightness-125' : ''}`}
                        style={{ background: accent + '33', color: accent, borderLeft: `2px solid ${accent}` }}
                        title={`${ev.personName} – ${ev.title}`}>
                        {multi
                          ? <AttendeeAvatars ids={ev.attendeePersonIds} personById={personById} size={12} />
                          : (ev.personName ? <span className="truncate">{ev.personName} – </span> : null)}
                        <span className="truncate">{ev.title}</span>
                        <ResponsibilityBadge ids={ev.responsiblePersonIds} personById={personById} size={12} />
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ minHeight: `${24 * rowHeight}px` }}>
          {/* Hour gutter */}
          <div className="w-14 flex-shrink-0 md:w-12">
            {HOURS.map(h => (
              <div key={h} className="relative" style={{ height: rowHeight }}>
                <span className="absolute -top-2 right-2 text-xs md:text-sm text-gray-600">
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
                className={`relative flex-1 border-l border-white/5 ${isToday ? 'bg-sky-500/[0.05]' : ''}`}
                style={{ minHeight: `${24 * rowHeight}px` }}>
                {HOURS.map(h => (
                  <div key={h} className="absolute w-full border-t border-white/5" style={{ top: h * rowHeight }} />
                ))}

                {/* Current time indicator */}
                {isToday && (
                  <div className="absolute z-10 w-full"
                    style={{ top: (now.getHours() + now.getMinutes() / 60) * rowHeight }}>
                    <div className="relative">
                      <div className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-sky-400/70" />
                      <div className="h-px bg-sky-400/40" />
                    </div>
                  </div>
                )}

                {layoutDayEvents(dayEvents).map(ev => {
                  const start  = new Date(ev.start)
                  const end    = new Date(ev.end)
                  const top    = (start.getHours() + start.getMinutes() / 60) * rowHeight
                  const height = Math.max(((end.getTime() - start.getTime()) / 3_600_000) * rowHeight, 24)
                  const pct    = 100 / ev.totalCols
                  const accent = tileAccent(ev)
                  const multi  = ev.attendeePersonIds.length > 1
                  // Stack time / title / avatars on separate lines when the tile
                  // is tall enough to breathe. Makes tablet-sized week view much
                  // more readable without regressing tight tiles on phone.
                  const stacked = height >= 52
                  const timeLabel = formatTime(start, use24h)
                  return (
                    <div key={ev.id}
                      onClick={() => onEventClick?.(ev)}
                      role={onEventClick ? 'button' : undefined}
                      className={`absolute overflow-hidden rounded-md px-1.5 py-1 md:py-1.5 text-xs md:text-sm ${onEventClick ? 'cursor-pointer hover:brightness-125' : ''}`}
                      style={{
                        top, height,
                        left:       `calc(${ev.col * pct}% + 2px)`,
                        width:      `calc(${pct}% - 4px)`,
                        background: accent + '33',
                        borderLeft: `3px solid ${accent}`,
                        color:      accent,
                      }}
                      title={`${ev.personName} – ${ev.title}`}>
                      {stacked ? (
                        <>
                          <div className="text-[10px] md:text-xs opacity-80">{timeLabel}</div>
                          <div className="flex items-center gap-1 leading-tight">
                            {multi && <AttendeeAvatars ids={ev.attendeePersonIds} personById={personById} size={14} />}
                            <span className="truncate font-semibold">{ev.title}</span>
                          </div>
                          {!multi && ev.personName && (
                            <div className="mt-0.5 truncate text-[10px] md:text-xs opacity-70">{ev.personName}</div>
                          )}
                        </>
                      ) : (
                        <>
                          {multi
                            ? <AttendeeAvatars ids={ev.attendeePersonIds} personById={personById} size={14} />
                            : (ev.personName && <span className="font-bold">{ev.personName} – </span>)}
                          <span>{ev.title}</span>
                        </>
                      )}
                      <ResponsibilityBadge ids={ev.responsiblePersonIds} personById={personById} size={14} />
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

function MonthView({ events, viewDate, todayStr, personById, onEventClick }: {
  events:        CalendarEvent[]
  viewDate:      Date
  todayStr:      string
  personById:    Map<string, Person>
  onEventClick?: (event: CalendarEvent) => void
}) {
  const cells = useMemo(() => {
    // Build 6-week grid starting from the Sunday of the week containing the 1st
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
    const start = new Date(first)
    start.setDate(first.getDate() - first.getDay())
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
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
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

          // More room on tablet and up — show more events per day.
          const maxShown = 3
          return (
            <div key={ds}
              className={`min-h-0 border-b border-r border-white/5 p-1 md:p-2 ${inMonth ? '' : 'opacity-30'}`}>
              <div className={`mb-1 flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full text-xs md:text-sm font-bold ${
                isToday ? 'bg-sky-500/25 text-sky-100 ring-1 ring-sky-400/40' : 'text-gray-400'
              }`}>
                {day.getDate()}
              </div>

              <div className="space-y-0.5 md:space-y-1">
                {/* Mobile: cap at 3 */}
                {unique.slice(0, maxShown).map(ev => (
                  <MonthTile key={`sm-${ev.id}`} ev={ev} personById={personById} onEventClick={onEventClick} className="md:hidden" />
                ))}
                {/* Tablet+: cap at 5 */}
                {unique.slice(0, 5).map(ev => (
                  <MonthTile key={`md-${ev.id}`} ev={ev} personById={personById} onEventClick={onEventClick} className="hidden md:flex" />
                ))}
                {unique.length > maxShown && (
                  <div className="pl-1 text-xs md:hidden text-gray-600">+{unique.length - maxShown} more</div>
                )}
                {unique.length > 5 && (
                  <div className="pl-1 text-xs hidden md:block text-gray-600">+{unique.length - 5} more</div>
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

function formatTime(d: Date, use24h: boolean): string {
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  if (use24h) return `${String(h).padStart(2, '0')}:${m}`
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${m} ${ampm}`
}
