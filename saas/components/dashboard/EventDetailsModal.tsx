'use client'

import { useEffect } from 'react'
import { MapPin, Users, UserCheck, Bell, Repeat, Settings, X } from 'lucide-react'
import type { CalendarEvent, Person } from '@/lib/supabase/types'

interface Props {
  event:             CalendarEvent
  people:            Person[]
  use24h:            boolean
  onClose:           () => void
  onEditAssignments: () => void   // jump to the overlay/assignment modal
}

export default function EventDetailsModal({ event, people, use24h, onClose, onEditAssignments }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const personById = new Map(people.map(p => [p.id, p] as const))
  const attendees   = event.attendeePersonIds.map(id => personById.get(id)).filter(Boolean) as Person[]
  const responsible = event.responsiblePersonIds.map(id => personById.get(id)).filter(Boolean) as Person[]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-gray-900 text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4"
             style={{ borderLeft: `4px solid ${event.color}` }}>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold" style={{ color: event.color }}>
              {event.title}
            </div>
            <div className="mt-0.5 text-xs text-gray-400">{formatWhen(event, use24h)}</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
          {event.location && (
            <Row icon={<MapPin className="h-4 w-4" />} label="Where">
              <span className="text-sm">{event.location}</span>
            </Row>
          )}

          {event.recurringEventId && (
            <Row icon={<Repeat className="h-4 w-4" />} label="Recurring">
              <span className="text-sm text-gray-300">
                This is one occurrence of a repeating event.
              </span>
            </Row>
          )}

          <Row icon={<Users className="h-4 w-4" />} label="Attending">
            {attendees.length === 0
              ? <span className="text-sm text-gray-500">No one tagged yet.</span>
              : <PersonPills people={attendees} />}
          </Row>

          <Row icon={<UserCheck className="h-4 w-4" />} label="Responsible">
            {responsible.length === 0
              ? <span className="text-sm text-gray-500">Not assigned.</span>
              : <PersonPills people={responsible} />}
          </Row>

          <Row icon={<Bell className="h-4 w-4" />} label="Reminder">
            <span className="text-sm text-gray-300">
              {event.offsetMin == null
                ? 'Family default'
                : event.offsetMin === 0
                  ? 'At event start'
                  : event.offsetMin < 60
                    ? `${event.offsetMin} min before`
                    : event.offsetMin < 1440
                      ? `${Math.round(event.offsetMin / 60)} hour${event.offsetMin === 60 ? '' : 's'} before`
                      : `${Math.round(event.offsetMin / 1440)} day${event.offsetMin === 1440 ? '' : 's'} before`}
            </span>
          </Row>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-white/[0.02] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5"
          >
            Close
          </button>
          <button
            onClick={onEditAssignments}
            className="flex items-center gap-1.5 rounded-md bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-400"
          >
            <Settings className="h-4 w-4" />
            Edit assignments
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────

function Row({ icon, label, children }:
  { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 pt-0.5 text-gray-500">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{label}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  )
}

function PersonPills({ people }: { people: Person[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map(p => (
        <span
          key={p.id}
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
          style={{ background: p.color }}
        >
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/20 text-[9px] font-bold"
          >
            {p.name.charAt(0).toUpperCase()}
          </span>
          {p.name}
        </span>
      ))}
    </div>
  )
}

// ── Time formatters ──────────────────────────────────────────

function formatWhen(ev: CalendarEvent, use24h: boolean): string {
  const start = new Date(ev.start)
  if (ev.allDay) {
    return start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' · all day'
  }
  const end   = new Date(ev.end)
  const day   = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return `${day} · ${fmtTime(start, use24h)} – ${fmtTime(end, use24h)}`
}

function fmtTime(d: Date, use24h: boolean): string {
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  if (use24h) return `${String(h).padStart(2, '0')}:${m}`
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${m} ${ampm}`
}
