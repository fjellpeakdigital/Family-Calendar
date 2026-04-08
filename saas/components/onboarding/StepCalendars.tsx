'use client'

import { useState, useEffect } from 'react'
import type { OnboardingState } from './OnboardingClient'
import type { CalAssignment } from '@/lib/supabase/types'

interface Props {
  state: OnboardingState
  setState: (s: OnboardingState) => void
  onNext: () => void
  onBack: () => void
  userEmail: string
}

interface GoogleCal {
  id: string
  name: string
  color: string
}

interface ConnectedAccount {
  email: string
}

export default function StepCalendars({ state, setState, onNext, onBack, userEmail }: Props) {
  const [connected, setConnected]     = useState<ConnectedAccount[]>([])
  const [calendars, setCalendars]     = useState<Record<string, GoogleCal[]>>({})
  const [loadingCal, setLoadingCal]   = useState<string | null>(null)
  const [connecting, setConnecting]   = useState(false)

  // Load already-connected accounts
  useEffect(() => {
    fetch('/api/account/connected')
      .then(r => r.json())
      .then(d => {
        setConnected(d.accounts ?? [])
        d.accounts?.forEach((a: ConnectedAccount) => loadCalendars(a.email))
      })
  }, [])

  async function loadCalendars(email: string) {
    setLoadingCal(email)
    try {
      const res = await fetch(`/api/account/calendars?email=${encodeURIComponent(email)}`)
      if (res.ok) {
        const data = await res.json()
        setCalendars(prev => ({ ...prev, [email]: data.calendars ?? [] }))
      }
    } finally {
      setLoadingCal(null)
    }
  }

  function connectAccount() {
    // Redirect to Google OAuth — server will store the token
    setConnecting(true)
    window.location.href = `/api/auth/signin/google?callbackUrl=${encodeURIComponent('/onboarding')}`
  }

  function toggleAssignment(cal: GoogleCal, accountEmail: string, personId: string) {
    const existing = state.cal_assignments.find(
      a => a.calendarId === cal.id && a.personId === personId
    )

    if (existing) {
      setState({
        ...state,
        cal_assignments: state.cal_assignments.filter(
          a => !(a.calendarId === cal.id && a.personId === personId)
        ),
      })
    } else {
      const newAssignment: CalAssignment = {
        calendarId:   cal.id,
        calendarName: cal.name,
        accountEmail,
        personId,
        color:        cal.color ?? '#58A6FF',
      }
      setState({
        ...state,
        cal_assignments: [...state.cal_assignments, newAssignment],
      })
    }
  }

  const people = state.people

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold">Connect Google Calendars</h2>
      <p className="mb-2 text-gray-400">
        Sign in with each Google account and assign calendars to family members.
        Events show on the dashboard but are never stored on our servers.
      </p>

      {/* Connected accounts */}
      {connected.length === 0 ? (
        <div className="mb-4 rounded-xl border border-dashed border-white/20 p-6 text-center">
          <p className="mb-3 text-gray-500">No Google accounts connected yet.</p>
          <button
            onClick={connectAccount}
            disabled={connecting}
            className="rounded-xl bg-blue-500 px-5 py-2 text-sm font-semibold transition hover:bg-blue-400 disabled:opacity-50"
          >
            {connecting ? 'Connecting…' : '+ Connect Google Account'}
          </button>
        </div>
      ) : (
        <div className="mb-4 space-y-4">
          {connected.map(account => (
            <div key={account.email} className="rounded-xl border border-white/10 bg-white/5">
              {/* Account header */}
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">📧 {account.email}</span>
                  {loadingCal === account.email && (
                    <span className="text-xs text-gray-500">Loading calendars…</span>
                  )}
                </div>
              </div>

              {/* Calendar list */}
              <div className="p-3 space-y-2">
                {(calendars[account.email] ?? []).map(cal => (
                  <div key={cal.id} className="rounded-lg border border-white/5 bg-white/3 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ background: cal.color }}
                      />
                      <span className="text-sm font-medium truncate">{cal.name}</span>
                    </div>

                    {/* Assign to person */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-gray-600">Show for:</span>
                      {people.map(person => {
                        const assigned = state.cal_assignments.some(
                          a => a.calendarId === cal.id && a.personId === person.id
                        )
                        return (
                          <button
                            key={person.id}
                            onClick={() => toggleAssignment(cal, account.email, person.id)}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-all ${
                              assigned
                                ? 'text-white'
                                : 'border border-white/20 text-gray-500 hover:text-white'
                            }`}
                            style={assigned ? { background: person.color } : {}}
                          >
                            {person.name || '(unnamed)'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={connectAccount}
            disabled={connecting}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-2.5 text-sm text-gray-500 transition hover:border-white/40 hover:text-gray-300 disabled:opacity-50"
          >
            {connecting ? 'Connecting…' : '+ Add another Google account'}
          </button>
        </div>
      )}

      <p className="mb-6 text-xs text-gray-600">
        🔒 Calendar data is fetched live and never stored. Only the calendar ID and assignment are saved.
      </p>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 rounded-xl border border-white/20 py-2.5 text-sm transition hover:bg-white/10">
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 rounded-xl bg-blue-500 py-2.5 text-sm font-semibold transition hover:bg-blue-400"
        >
          {state.cal_assignments.length === 0 ? 'Skip for now →' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}
