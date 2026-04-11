'use client'

import { Sparkles, Settings } from 'lucide-react'
import type { OnboardingState } from './OnboardingClient'

interface Props {
  state:    OnboardingState
  onFinish: () => void
  saving:   boolean
}

export default function StepDone({ state, onFinish, saving }: Props) {
  const kids   = state.people.filter(p => p.type === 'kid')
  const adults = state.people.filter(p => p.type === 'adult')

  return (
    <div className="text-center">
      <div className="mb-4 flex justify-center"><Sparkles className="h-14 w-14 text-yellow-400" strokeWidth={1.25} /></div>
      <h2 className="mb-2 text-2xl font-bold">You're all set!</h2>
      <p className="mb-8 text-gray-400">Here's what we'll save for your family:</p>

      <div className="mb-8 space-y-3 text-left">
        <SummaryRow
          label="Family members"
          value={
            state.people.length === 0
              ? 'None added'
              : [
                  adults.length > 0 ? `${adults.length} adult${adults.length > 1 ? 's' : ''}` : '',
                  kids.length > 0   ? `${kids.length} kid${kids.length > 1 ? 's' : ''}` : '',
                ].filter(Boolean).join(', ')
          }
        />
        <SummaryRow
          label="Calendars assigned"
          value={
            state.cal_assignments.length === 0
              ? 'None — add them from the admin panel'
              : `${state.cal_assignments.length} calendar${state.cal_assignments.length > 1 ? 's' : ''}`
          }
        />
        <SummaryRow
          label="Chores"
          value={
            state.chores.length === 0
              ? 'None — add them from the admin panel'
              : `${state.chores.length} chore${state.chores.length > 1 ? 's' : ''}`
          }
        />
      </div>

      <div className="mb-6 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-gray-400">
        <p>You can change everything any time from the <strong className="inline-flex items-center gap-1 text-white"><Settings className="h-3.5 w-3.5" /> Admin panel</strong> on the dashboard.</p>
      </div>

      <button
        onClick={onFinish}
        disabled={saving}
        className="w-full rounded-xl bg-white/15 py-3 font-semibold ring-1 ring-white/20 transition hover:bg-white/20 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Go to dashboard →'}
      </button>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-right text-sm font-medium text-white">{value}</span>
    </div>
  )
}
