'use client'

import { useEffect, useState } from 'react'
import type { CalendarEvent, Person } from '@/lib/supabase/types'

type Scope = 'instance' | 'series'

interface Props {
  event:    CalendarEvent
  people:   Person[]
  use24h:   boolean
  onClose:  () => void
  onSaved:  () => void         // parent refetches events after save/clear
}

export default function EventOverlayModal({ event, people, use24h, onClose, onSaved }: Props) {
  const isRecurring = !!event.recurringEventId

  // Prefill from the merged overlay already on the event.
  const [attendees,   setAttendees]   = useState<string[]>(event.attendeePersonIds)
  const [responsible, setResponsible] = useState<string[]>(event.responsiblePersonIds)
  const [scope,       setScope]       = useState<Scope>(isRecurring ? 'series' : 'instance')
  // '' means "use family default"; number means "this specific offset".
  const [offsetStr,   setOffsetStr]   = useState<string>(
    event.offsetMin == null ? '' : String(event.offsetMin)
  )
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const adults = people.filter(p => p.type === 'adult')

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter(x => x !== id) : [...list, id]

  async function handleSave() {
    setSaving(true); setError(null)
    const key = scope === 'series' ? event.recurringEventId! : event.eventKey
    const offsetMin = offsetStr === '' ? null : Number(offsetStr)
    const res = await fetch('/api/overlay', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope,
        key,
        attendee_person_ids:    attendees,
        responsible_person_ids: responsible,
        offset_min:             offsetMin,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      setError((await res.json()).error ?? 'Save failed')
      return
    }
    onSaved()
    onClose()
  }

  async function handleClear() {
    setSaving(true); setError(null)
    const key = scope === 'series' ? event.recurringEventId! : event.eventKey
    const res = await fetch(
      `/api/overlay?scope=${scope}&key=${encodeURIComponent(key)}`,
      { method: 'DELETE' }
    )
    setSaving(false)
    if (!res.ok) {
      setError((await res.json()).error ?? 'Clear failed')
      return
    }
    onSaved()
    onClose()
  }

  const timeLabel = formatEventTime(event, use24h)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-gray-900 text-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-white/10 px-5 py-4">
          <div className="truncate text-lg font-semibold" style={{ color: event.color }}>
            {event.title}
          </div>
          <div className="mt-0.5 text-xs text-gray-400">{timeLabel}</div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-5 py-4">
          <Section title="Who's attending">
            {people.length === 0 && <EmptyHint text="No people yet — add them in Admin." />}
            {people.map(p => (
              <PersonRow
                key={p.id}
                person={p}
                checked={attendees.includes(p.id)}
                onToggle={() => setAttendees(l => toggle(l, p.id))}
              />
            ))}
          </Section>

          <Section title="Who's responsible">
            {adults.length === 0
              ? <EmptyHint text="No adults yet — add them in Admin." />
              : adults.map(p => (
                <PersonRow
                  key={p.id}
                  person={p}
                  checked={responsible.includes(p.id)}
                  onToggle={() => setResponsible(l => toggle(l, p.id))}
                />
              ))}
          </Section>

          <Section title="Reminder">
            <select
              value={offsetStr}
              onChange={e => setOffsetStr(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400/50"
            >
              <option value="">Use family default</option>
              <option value="0">At event start</option>
              <option value="15">15 min before</option>
              <option value="60">1 hour before</option>
              <option value="240">4 hours before</option>
              <option value="1440">1 day before</option>
            </select>
            <p className="mt-1 text-[11px] text-gray-500">
              Emails the responsible adult(s) when the reminder lands.
            </p>
          </Section>

          {isRecurring && (
            <Section title="Apply to">
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                <input
                  type="radio"
                  checked={scope === 'series'}
                  onChange={() => setScope('series')}
                  className="accent-indigo-400"
                />
                <span className="text-sm">Every time</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                <input
                  type="radio"
                  checked={scope === 'instance'}
                  onChange={() => setScope('instance')}
                  className="accent-indigo-400"
                />
                <span className="text-sm">Only this time</span>
              </label>
            </Section>
          )}

          {error && <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-white/[0.02] px-5 py-3">
          <button
            onClick={handleClear}
            disabled={saving}
            className="rounded-md px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            Clear override
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-md px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Small components ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-white/10 px-3 py-2 text-xs text-gray-500">{text}</div>
}

function PersonRow({ person, checked, onToggle }:
  { person: Person; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 rounded accent-indigo-400"
      />
      <span
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: person.color }}
      >
        {person.name.charAt(0).toUpperCase()}
      </span>
      <span className="text-sm">{person.name}</span>
      <span className="ml-auto text-[10px] uppercase tracking-widest text-gray-600">
        {person.type}
      </span>
    </label>
  )
}

// ── Utilities ──────────────────────────────────────────────────

function formatEventTime(event: CalendarEvent, use24h: boolean): string {
  if (event.allDay) {
    return new Date(event.start).toLocaleDateString('en-US',
      { weekday: 'long', month: 'short', day: 'numeric' }) + ' · all day'
  }
  const start = new Date(event.start)
  const end   = new Date(event.end)
  const dayLabel = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return `${dayLabel} · ${formatTime(start, use24h)} – ${formatTime(end, use24h)}`
}

function formatTime(d: Date, use24h: boolean): string {
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  if (use24h) return `${String(h).padStart(2, '0')}:${m}`
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${m} ${ampm}`
}
