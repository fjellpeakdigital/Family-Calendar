'use client'

import { useState } from 'react'
import type { OnboardingState } from './OnboardingClient'
import type { ChoreDefinition, Period } from '@/lib/supabase/types'

const DAYS    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const PERIODS: { key: Period; label: string; emoji: string }[] = [
  { key: 'morning',   label: 'Morning',   emoji: '🌅' },
  { key: 'afternoon', label: 'Afternoon', emoji: '☀️' },
  { key: 'evening',   label: 'Evening',   emoji: '🌙' },
  { key: 'anytime',   label: 'Any time',  emoji: '🕐' },
]

// Starter chore templates
const TEMPLATES: Omit<ChoreDefinition, 'id' | 'kid_ids'>[] = [
  { task: 'Brush teeth',  days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], period: 'morning',   points: 1 },
  { task: 'Brush teeth',  days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], period: 'evening',   points: 1 },
  { task: 'Make bed',     days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], period: 'morning',   points: 2 },
  { task: 'Do homework',  days: ['Mon','Tue','Wed','Thu','Fri'],             period: 'afternoon', points: 5 },
  { task: 'Tidy room',    days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], period: 'anytime',   points: 3 },
]

interface Props {
  state: OnboardingState
  setState: (s: OnboardingState) => void
  onNext: () => void
  onBack: () => void
}

export default function StepChores({ state, setState, onNext, onBack }: Props) {
  const [newTask, setNewTask]         = useState('')
  const [newDays, setNewDays]         = useState<string[]>(['Mon','Tue','Wed','Thu','Fri'])
  const [newPeriod, setNewPeriod]     = useState<Period>('anytime')
  const [newPoints, setNewPoints]     = useState(1)
  const [selectedKids, setSelectedKids] = useState<string[]>([])

  const kids = state.people.filter(p => p.type === 'kid')

  function addFromTemplate(tmpl: typeof TEMPLATES[0]) {
    const kidIds = kids.map(k => k.id)
    const chore: ChoreDefinition = {
      id:      crypto.randomUUID(),
      task:    tmpl.task,
      days:    tmpl.days,
      period:  tmpl.period,
      points:  tmpl.points,
      kid_ids: kidIds,
    }
    setState({ ...state, chores: [...state.chores, chore] })
  }

  function addChore() {
    if (!newTask.trim()) return
    const chore: ChoreDefinition = {
      id:      crypto.randomUUID(),
      task:    newTask.trim(),
      days:    newDays,
      period:  newPeriod,
      points:  newPoints,
      kid_ids: selectedKids.length > 0 ? selectedKids : kids.map(k => k.id),
    }
    setState({ ...state, chores: [...state.chores, chore] })
    setNewTask('')
    setNewDays(['Mon','Tue','Wed','Thu','Fri'])
    setNewPeriod('anytime')
    setNewPoints(1)
    setSelectedKids([])
  }

  function removeChore(id: string) {
    setState({ ...state, chores: state.chores.filter(c => c.id !== id) })
  }

  function toggleDay(day: string) {
    setNewDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  function toggleKid(id: string) {
    setSelectedKids(prev =>
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    )
  }

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold">Set up chores</h2>
      <p className="mb-4 text-gray-400">
        Add daily tasks for your kids. You can skip this and add chores later.
      </p>

      {/* Quick-add templates */}
      {kids.length > 0 && state.chores.length === 0 && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Quick start</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((tmpl, i) => (
              <button
                key={i}
                onClick={() => addFromTemplate(tmpl)}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs transition hover:bg-white/10"
              >
                + {tmpl.task} ({tmpl.period})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Existing chores */}
      {state.chores.length > 0 && (
        <div className="mb-4 space-y-2">
          {state.chores.map(chore => {
            const assignedKids = kids.filter(k => chore.kid_ids.includes(k.id))
            return (
              <div key={chore.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{chore.task}</p>
                  <p className="text-xs text-gray-500">
                    {chore.days.join(', ')} · {PERIODS.find(p => p.key === chore.period)?.emoji} {chore.period}
                    {chore.points > 0 && ` · ⭐ ${chore.points}pts`}
                    {assignedKids.length > 0 && ` · ${assignedKids.map(k => k.name).join(', ')}`}
                  </p>
                </div>
                <button onClick={() => removeChore(chore.id)} className="text-gray-600 hover:text-red-400">✕</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add chore form */}
      {kids.length > 0 && (
        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Add a chore</p>

          <input
            type="text"
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addChore()}
            placeholder="e.g. Clean room"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-blue-500/50"
          />

          {/* Days */}
          <div className="flex flex-wrap gap-1">
            {DAYS.map(d => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  newDays.includes(d) ? 'bg-blue-500 text-white' : 'border border-white/15 text-gray-500 hover:text-white'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Period + Points */}
          <div className="flex gap-2">
            <select
              value={newPeriod}
              onChange={e => setNewPeriod(e.target.value as Period)}
              className="flex-1 rounded-lg border border-white/10 bg-gray-900 px-2 py-1.5 text-xs"
            >
              {PERIODS.map(p => (
                <option key={p.key} value={p.key}>{p.emoji} {p.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">⭐ pts:</span>
              <input
                type="number"
                min="0"
                max="100"
                value={newPoints}
                onChange={e => setNewPoints(Number(e.target.value))}
                className="w-14 rounded-lg border border-white/10 bg-gray-900 px-2 py-1.5 text-center text-xs"
              />
            </div>
          </div>

          {/* Assign to specific kids */}
          {kids.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500">For:</span>
              {kids.map(k => (
                <button
                  key={k.id}
                  onClick={() => toggleKid(k.id)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${
                    selectedKids.includes(k.id) ? 'text-white' : 'border border-white/15 text-gray-500'
                  }`}
                  style={selectedKids.includes(k.id) ? { background: k.color } : {}}
                >
                  {k.name}
                </button>
              ))}
              {selectedKids.length === 0 && (
                <span className="text-xs text-gray-600">(all kids)</span>
              )}
            </div>
          )}

          <button
            onClick={addChore}
            disabled={!newTask.trim()}
            className="w-full rounded-xl border border-white/15 py-2 text-sm text-gray-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            + Add chore
          </button>
        </div>
      )}

      {kids.length === 0 && (
        <p className="mb-6 rounded-xl border border-white/10 p-4 text-center text-sm text-gray-500">
          Add kids in the previous step to set up chores.
        </p>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 rounded-xl border border-white/20 py-2.5 text-sm transition hover:bg-white/10">
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 rounded-xl bg-blue-500 py-2.5 text-sm font-semibold transition hover:bg-blue-400"
        >
          {state.chores.length === 0 ? 'Skip for now →' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}
