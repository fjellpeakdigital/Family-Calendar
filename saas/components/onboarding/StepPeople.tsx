'use client'

import { useState } from 'react'
import type { OnboardingState } from './OnboardingClient'
import type { Person } from '@/lib/supabase/types'

const COLORS = ['#58A6FF','#FF7EB3','#3FB950','#D29922','#F85149','#A371F7','#FFA657','#39D353']
const EMOJIS = ['👦','👧','👨','👩','🧑','👴','👵','🐱','🐶','⭐']

interface Props {
  state: OnboardingState
  setState: (s: OnboardingState) => void
  onNext: () => void
  onBack: () => void
}

function newPerson(type: 'adult' | 'kid', index: number): Person {
  return {
    id:    crypto.randomUUID(),
    name:  '',
    type,
    color: COLORS[index % COLORS.length],
    emoji: type === 'kid' ? EMOJIS[index % EMOJIS.length] : '👤',
  }
}

export default function StepPeople({ state, setState, onNext, onBack }: Props) {
  const [error, setError] = useState('')

  const people = state.people
  const adults = people.filter(p => p.type === 'adult')
  const kids   = people.filter(p => p.type === 'kid')

  function addPerson(type: 'adult' | 'kid') {
    const count = people.filter(p => p.type === type).length
    setState({ ...state, people: [...people, newPerson(type, count)] })
  }

  function updatePerson(id: string, updates: Partial<Person>) {
    setState({
      ...state,
      people: people.map(p => p.id === id ? { ...p, ...updates } : p),
    })
  }

  function removePerson(id: string) {
    setState({
      ...state,
      people: people.filter(p => p.id !== id),
      cal_assignments: state.cal_assignments.filter(a => a.personId !== id),
      chores: state.chores.map(c => ({
        ...c,
        kid_ids: c.kid_ids.filter(k => k !== id),
      })),
    })
  }

  function validate() {
    if (people.length === 0) { setError('Add at least one family member.'); return false }
    if (people.some(p => !p.name.trim())) { setError('All family members need a name.'); return false }
    setError('')
    return true
  }

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold">Who's in your family?</h2>
      <p className="mb-6 text-gray-400">Add the people who'll be on the dashboard. You can edit this any time.</p>

      {/* Adults */}
      <div className="mb-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Adults</h3>
        <div className="space-y-2">
          {adults.map(p => (
            <PersonRow key={p.id} person={p} onUpdate={u => updatePerson(p.id, u)} onRemove={() => removePerson(p.id)} />
          ))}
        </div>
        <button
          onClick={() => addPerson('adult')}
          className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-white/20 px-4 py-2.5 text-sm text-gray-500 transition hover:border-white/40 hover:text-gray-300"
        >
          + Add adult
        </button>
      </div>

      {/* Kids */}
      <div className="mb-6">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Kids</h3>
        <div className="space-y-2">
          {kids.map(p => (
            <PersonRow key={p.id} person={p} onUpdate={u => updatePerson(p.id, u)} onRemove={() => removePerson(p.id)} showEmoji />
          ))}
        </div>
        <button
          onClick={() => addPerson('kid')}
          className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-white/20 px-4 py-2.5 text-sm text-gray-500 transition hover:border-white/40 hover:text-gray-300"
        >
          + Add kid
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 rounded-xl border border-white/20 py-2.5 text-sm transition hover:bg-white/10">
          Back
        </button>
        <button
          onClick={() => validate() && onNext()}
          className="flex-1 rounded-xl bg-blue-500 py-2.5 text-sm font-semibold transition hover:bg-blue-400"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

function PersonRow({
  person,
  onUpdate,
  onRemove,
  showEmoji = false,
}: {
  person: Person
  onUpdate: (u: Partial<Person>) => void
  onRemove: () => void
  showEmoji?: boolean
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
      {showEmoji && (
        <select
          value={person.emoji}
          onChange={e => onUpdate({ emoji: e.target.value })}
          className="rounded-lg border border-white/10 bg-transparent py-1 text-xl"
        >
          {['👦','👧','👨','👩','🧑','🐱','🐶','⭐','🦊','🐻'].map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      )}

      {/* Color dot */}
      <div className="relative">
        <div
          className="h-5 w-5 flex-shrink-0 cursor-pointer rounded-full border-2 border-white/20"
          style={{ background: person.color }}
          title="Click to change color"
        />
        <input
          type="color"
          value={person.color}
          onChange={e => onUpdate({ color: e.target.value })}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <input
        type="text"
        value={person.name}
        onChange={e => onUpdate({ name: e.target.value })}
        placeholder="Name"
        className="flex-1 rounded-lg border border-transparent bg-transparent py-1 text-sm outline-none placeholder:text-gray-600 focus:border-white/20 focus:bg-white/5"
      />

      <button
        onClick={onRemove}
        className="text-gray-600 transition hover:text-red-400"
        aria-label="Remove"
      >
        ✕
      </button>
    </div>
  )
}
