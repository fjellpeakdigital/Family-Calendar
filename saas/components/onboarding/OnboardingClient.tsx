'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import StepWelcome    from './StepWelcome'
import StepPeople     from './StepPeople'
import StepCalendars  from './StepCalendars'
import StepChores     from './StepChores'
import StepDone       from './StepDone'
import type { Person, ChoreDefinition, CalAssignment } from '@/lib/supabase/types'

export interface OnboardingState {
  people:          Person[]
  chores:          ChoreDefinition[]
  cal_assignments: CalAssignment[]
}

const STEPS = ['welcome', 'people', 'calendars', 'chores', 'done'] as const
type Step = typeof STEPS[number]

export default function OnboardingClient({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('welcome')
  const [saving, setSaving] = useState(false)
  const [state, setState] = useState<OnboardingState>({
    people:          [],
    chores:          [],
    cal_assignments: [],
  })

  // Restore progress after Google OAuth redirect (full-page reload wipes React state)
  useEffect(() => {
    const saved = sessionStorage.getItem('onboarding_resume')
    if (!saved) return
    sessionStorage.removeItem('onboarding_resume')
    try {
      const { step: s, state: st } = JSON.parse(saved) as { step: Step; state: OnboardingState }
      if (STEPS.includes(s)) {
        setStep(s)
        setState(st)
      }
    } catch { /* ignore corrupt data */ }
  }, [])

  const stepIndex = STEPS.indexOf(step)

  function next() {
    const nextStep = STEPS[stepIndex + 1]
    if (nextStep) setStep(nextStep)
  }
  function back() {
    const prevStep = STEPS[stepIndex - 1]
    if (prevStep) setStep(prevStep)
  }

  async function finish() {
    setSaving(true)
    try {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            people:          state.people,
            chores:          state.chores,
            cal_assignments: state.cal_assignments,
            settings: { location: '', use24h: false, theme: 'dark', pin: '1234' },
            rewards: {},
            points:  {},
          },
        }),
      })
      router.push('/dashboard')
    } finally {
      setSaving(false)
    }
  }

  const commonProps = { state, setState, onNext: next, onBack: back }

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* Progress bar */}
      <div className="h-1 bg-white/10">
        <div
          className="h-full bg-blue-500 transition-all duration-500"
          style={{ width: `${((stepIndex) / (STEPS.length - 1)) * 100}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Step counter */}
          {step !== 'welcome' && step !== 'done' && (
            <p className="mb-4 text-center text-xs font-medium uppercase tracking-widest text-gray-600">
              Step {stepIndex} of {STEPS.length - 2}
            </p>
          )}

          {step === 'welcome'   && <StepWelcome   userEmail={userEmail} onNext={next} />}
          {step === 'people'    && <StepPeople    {...commonProps} />}
          {step === 'calendars' && <StepCalendars {...commonProps} userEmail={userEmail} />}
          {step === 'chores'    && <StepChores    {...commonProps} />}
          {step === 'done'      && <StepDone      state={state} onFinish={finish} saving={saving} />}
        </div>
      </div>
    </div>
  )
}
