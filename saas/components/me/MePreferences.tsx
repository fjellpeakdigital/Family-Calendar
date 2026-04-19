'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { disablePush, ensurePushSubscription, getPushStatus } from '@/lib/push-client'
import type { Person, QuietHours } from '@/lib/supabase/types'

interface Props {
  people:           Person[]
  initialPersonId:  string | null
  onClose:          () => void
}

interface Prefs {
  email_enabled:   boolean
  push_enabled:    boolean
  quiet_hours:     QuietHours | null
  default_offsets: number[]
}

export default function MePreferences({ people, initialPersonId, onClose }: Props) {
  const adults = people.filter(p => p.type === 'adult')

  const [personId, setPersonId] = useState<string | null>(initialPersonId)
  const [prefs, setPrefs]       = useState<Prefs | null>(null)
  const [saving, setSaving]     = useState(false)
  const [pushStatus, setPushStatus] = useState<
    'loading' | 'unsupported' | 'denied' | 'unconfigured' | 'off' | 'on'
  >('loading')
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    getPushStatus().then(setPushStatus).catch(() => setPushStatus('unsupported'))
  }, [])

  async function handlePushToggle(enable: boolean) {
    setPushBusy(true)
    try {
      const next = enable
        ? await ensurePushSubscription()
        : await disablePush()
      setPushStatus(next)
    } finally {
      setPushBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    fetch('/api/account/prefs')
      .then(r => r.ok ? r.json() : null)
      .then(d => setPrefs((d?.prefs as Prefs) ?? null))
      .catch(() => setPrefs(null))
  }, [])

  async function savePersonId(next: string | null) {
    setSaving(true)
    await fetch('/api/account/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: next }),
    })
    setPersonId(next)
    setSaving(false)
  }

  async function savePrefs(patch: Partial<Prefs>) {
    setSaving(true)
    const res = await fetch('/api/account/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) setPrefs(p => p ? { ...p, ...patch } : p)
    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-t-2xl border-t border-white/10 bg-gray-900 text-white shadow-2xl sm:rounded-2xl sm:border">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold">Your preferences</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
          {/* I am */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
              I am
            </h3>
            {adults.length === 0 ? (
              <p className="text-xs text-gray-500">
                Add an adult from the dashboard first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {adults.map(p => {
                  const selected = personId === p.id
                  return (
                    <button
                      key={p.id}
                      disabled={saving}
                      onClick={() => savePersonId(selected ? null : p.id)}
                      className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                        selected
                          ? 'text-white ring-2 ring-white/60'
                          : 'border border-white/15 text-gray-400 hover:text-white'
                      }`}
                      style={selected ? { background: p.color } : {}}
                    >
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ background: p.color }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      {p.name}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Channels */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Reminders
            </h3>

            <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <div className="text-sm">Email</div>
                <div className="text-[11px] text-gray-500">Reminders to {emailDomainForUI()}</div>
              </div>
              <input
                type="checkbox"
                disabled={!prefs || saving}
                checked={prefs?.email_enabled ?? true}
                onChange={e => savePrefs({ email_enabled: e.target.checked })}
                className="h-4 w-4 accent-indigo-400"
              />
            </label>

            <label className={`flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 ${pushHelp(pushStatus).dim ? 'opacity-60' : ''}`}>
              <div className="min-w-0 flex-1 pr-3">
                <div className="text-sm">Push</div>
                <div className="text-[11px] text-gray-500">{pushHelp(pushStatus).message}</div>
              </div>
              <input
                type="checkbox"
                disabled={pushBusy || pushHelp(pushStatus).blocked}
                checked={pushStatus === 'on'}
                onChange={e => handlePushToggle(e.target.checked)}
                className="h-4 w-4 accent-indigo-400"
              />
            </label>
          </section>

          {/* Quiet hours */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Quiet hours
            </h3>
            <QuietHoursControl
              value={prefs?.quiet_hours ?? null}
              disabled={!prefs || saving}
              onChange={v => savePrefs({ quiet_hours: v })}
            />
          </section>
        </div>
      </div>
    </div>
  )
}

// ── Quiet hours control ──────────────────────────────────────

function QuietHoursControl({ value, disabled, onChange }: {
  value: QuietHours | null
  disabled: boolean
  onChange: (v: QuietHours | null) => void
}) {
  const enabled = !!value
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <span className="text-sm">Silence reminders overnight</span>
        <input
          type="checkbox"
          disabled={disabled}
          checked={enabled}
          onChange={e => onChange(e.target.checked ? { start: '22:00', end: '07:00' } : null)}
          className="h-4 w-4 accent-indigo-400"
        />
      </label>
      {enabled && value && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs">
          <span className="text-gray-500">From</span>
          <input
            type="time"
            disabled={disabled}
            value={value.start}
            onChange={e => onChange({ ...value, start: e.target.value })}
            className="rounded-md border border-white/10 bg-gray-900 px-2 py-1 text-sm text-white"
          />
          <span className="text-gray-500">to</span>
          <input
            type="time"
            disabled={disabled}
            value={value.end}
            onChange={e => onChange({ ...value, end: e.target.value })}
            className="rounded-md border border-white/10 bg-gray-900 px-2 py-1 text-sm text-white"
          />
        </div>
      )}
    </div>
  )
}

// Placeholder copy — the logged-in email is already in the URL's session;
// showing it here would require another fetch, not worth it for a hint.
function emailDomainForUI(): string {
  return 'your email'
}

function pushHelp(status: 'loading' | 'unsupported' | 'denied' | 'unconfigured' | 'off' | 'on') {
  switch (status) {
    case 'loading':      return { message: 'Checking…',                                 blocked: true,  dim: true  }
    case 'unsupported':  return { message: 'This browser does not support push.',        blocked: true,  dim: true  }
    case 'denied':       return { message: 'Permission denied. Enable in browser settings.', blocked: true,  dim: true  }
    case 'unconfigured': return { message: 'Server is not set up for push yet.',         blocked: true,  dim: true  }
    case 'off':          return { message: 'Install the app on your phone, then enable.', blocked: false, dim: false }
    case 'on':           return { message: 'You will get push notifications on this device.', blocked: false, dim: false }
  }
}
