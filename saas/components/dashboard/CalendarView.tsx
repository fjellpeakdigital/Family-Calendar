'use client'

import { useMemo } from 'react'
import type { Person } from '@/lib/supabase/types'
import type { CalendarEvent } from './DashboardClient'

interface Props {
  events: CalendarEvent[]
  people: Person[]
  loading: boolean
  now: Date
  use24h: boolean
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

export default function CalendarView({ events, people, loading, now, use24h }: Props) {
  // Build the week starting on Monday
  const weekDays = useMemo(() => {
    const days: Date[] = []
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      days.push(d)
    }
    return days
  }, [now])

  const todayStr = now.toISOString().slice(0, 10)

  // Split events into all-day and timed
  const allDayEvents = events.filter(e => e.allDay)
  const timedEvents  = events.filter(e => !e.allDay)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Day header row */}
      <div className="flex flex-shrink-0 border-b border-white/10">
        {/* Gutter */}
        <div className="w-14 flex-shrink-0" />
        {weekDays.map(day => {
          const isToday = day.toISOString().slice(0, 10) === todayStr
          return (
            <div
              key={day.toISOString()}
              className="flex flex-1 flex-col items-center py-2"
            >
              <span className={`text-xs font-medium uppercase tracking-wider ${isToday ? 'text-blue-400' : 'text-gray-500'}`}>
                {DAY_NAMES[day.getDay()]}
              </span>
              <span
                className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                  isToday ? 'bg-blue-500 text-white' : 'text-white'
                }`}
              >
                {day.getDate()}
              </span>
            </div>
          )
        })}
      </div>

      {/* All-day events row */}
      {allDayEvents.length > 0 && (
        <div className="flex flex-shrink-0 border-b border-white/10 py-1">
          <div className="w-14 flex-shrink-0 text-right pr-2 text-xs text-gray-600 pt-1">
            all day
          </div>
          <div className="flex flex-1 gap-0">
            {weekDays.map(day => {
              const dayStr = day.toISOString().slice(0, 10)
              const dayEvents = allDayEvents.filter(e => e.start.slice(0, 10) <= dayStr && e.end.slice(0, 10) > dayStr)
              return (
                <div key={dayStr} className="flex-1 px-0.5">
                  {dayEvents.map(ev => (
                    <div
                      key={ev.id}
                      className="mb-0.5 truncate rounded px-1 py-0.5 text-xs font-medium"
                      style={{ background: ev.color + '33', color: ev.color, borderLeft: `2px solid ${ev.color}` }}
                      title={`${ev.personName} – ${ev.title}`}
                    >
                      {ev.personName ? `${ev.personName} – ` : ''}{ev.title}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
            Loading events…
          </div>
        )}
        <div className="flex" style={{ minHeight: `${24 * 56}px` }}>
          {/* Hour gutter */}
          <div className="w-14 flex-shrink-0">
            {HOURS.map(h => (
              <div key={h} className="relative" style={{ height: 56 }}>
                <span className="absolute -top-2 right-2 text-xs text-gray-600">
                  {formatHour(h, use24h)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map(day => {
            const dayStr  = day.toISOString().slice(0, 10)
            const isToday = dayStr === todayStr
            const dayTimedEvents = timedEvents.filter(e => e.start.slice(0, 10) === dayStr)

            return (
              <div
                key={dayStr}
                className={`relative flex-1 border-l border-white/5 ${isToday ? 'bg-blue-950/10' : ''}`}
                style={{ minHeight: `${24 * 56}px` }}
              >
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-white/5"
                    style={{ top: h * 56 }}
                  />
                ))}

                {/* Current time indicator */}
                {isToday && (
                  <div
                    className="absolute z-10 w-full"
                    style={{ top: (now.getHours() + now.getMinutes() / 60) * 56 }}
                  >
                    <div className="relative">
                      <div className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-blue-400" />
                      <div className="h-px bg-blue-400 opacity-60" />
                    </div>
                  </div>
                )}

                {/* Events */}
                {dayTimedEvents.map(ev => {
                  const start  = new Date(ev.start)
                  const end    = new Date(ev.end)
                  const top    = (start.getHours() + start.getMinutes() / 60) * 56
                  const height = Math.max(
                    ((end.getTime() - start.getTime()) / 3_600_000) * 56,
                    20
                  )

                  return (
                    <div
                      key={ev.id}
                      className="absolute left-0.5 right-0.5 overflow-hidden rounded-md px-1.5 py-1 text-xs"
                      style={{
                        top,
                        height,
                        background: ev.color + '33',
                        borderLeft: `3px solid ${ev.color}`,
                        color: ev.color,
                      }}
                      title={`${ev.personName} – ${ev.title}`}
                    >
                      {ev.personName && (
                        <span className="font-bold">{ev.personName} – </span>
                      )}
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

function formatHour(h: number, use24h: boolean): string {
  if (use24h) return h === 0 ? '' : `${String(h).padStart(2, '0')}:00`
  if (h === 0) return ''
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}
