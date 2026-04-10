'use client'

import { useState, useRef, useEffect } from 'react'
import { useConfig } from './ConfigProvider'
import type { Person, ChoreDefinition, CalAssignment, Reward, Period } from '@/lib/supabase/types'

const COLORS  = ['#58A6FF','#FF7EB3','#3FB950','#D29922','#F85149','#A371F7','#FFA657','#39D353']
const DAYS    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const PERIODS: { key: Period; label: string; emoji: string }[] = [
  { key: 'morning',   label: 'Morning',   emoji: '🌅' },
  { key: 'afternoon', label: 'Afternoon', emoji: '☀️' },
  { key: 'evening',   label: 'Evening',   emoji: '🌙' },
  { key: 'anytime',   label: 'Any time',  emoji: '🕐' },
]
const REWARD_EMOJIS = ['🎮','🍕','🎬','🧁','🏆','🎨','🚀','⭐','🎯','🎁']

type Tab = 'people' | 'calendars' | 'chores' | 'settings'

interface Props {
  onClose:    () => void
  userEmail:  string
  familyPlan: string
}

// ── PIN screen ─────────────────────────────────────────────────

function PinScreen({ pin, onUnlock }: { pin: string; onUnlock: () => void }) {
  const [entered, setEntered] = useState('')
  const [shake,   setShake]   = useState(false)

  function press(digit: string) {
    const next = entered + digit
    if (next.length < 4) { setEntered(next); return }
    if (next === pin) { onUnlock(); return }
    setShake(true)
    setEntered('')
    setTimeout(() => setShake(false), 500)
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <h2 className="text-xl font-bold text-white">Admin Panel</h2>
      <div className={`flex gap-3 ${shake ? 'animate-shake' : ''}`}>
        {[0,1,2,3].map(i => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-all ${
              entered.length > i ? 'border-blue-400 bg-blue-400' : 'border-white/30'
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
          key === '' ? <div key={i} /> :
          <button
            key={i}
            onClick={() => key === '⌫' ? setEntered(e => e.slice(0,-1)) : press(key)}
            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg font-semibold text-white transition active:scale-95 hover:bg-white/10"
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main admin panel ───────────────────────────────────────────

export default function AdminPanel({ onClose, userEmail, familyPlan }: Props) {
  const { config, saveConfig } = useConfig()
  const [unlocked, setUnlocked] = useState(false)
  const [tab, setTab] = useState<Tab>('people')

  const pin = config.settings?.pin ?? '1234'

  if (!unlocked) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950/95 backdrop-blur">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-500 hover:text-white">✕</button>
        <PinScreen pin={pin} onUnlock={() => setUnlocked(true)} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950/98 backdrop-blur">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
        <h2 className="text-lg font-bold text-white">Admin Panel</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0 gap-1 border-b border-white/10 px-6 pt-2">
        {(['people','calendars','chores','settings'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold capitalize transition ${
              tab === t
                ? 'border-b-2 border-blue-500 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'people'    && <PeopleTab    config={config} saveConfig={saveConfig} />}
        {tab === 'calendars' && <CalendarsTab config={config} saveConfig={saveConfig} userEmail={userEmail} />}
        {tab === 'chores'    && <ChoresTab    config={config} saveConfig={saveConfig} familyPlan={familyPlan} />}
        {tab === 'settings'  && <SettingsTab  config={config} saveConfig={saveConfig} />}
      </div>
    </div>
  )
}

// ── People Tab ────────────────────────────────────────────────

function PeopleTab({ config, saveConfig }: { config: ReturnType<typeof useConfig>['config'], saveConfig: ReturnType<typeof useConfig>['saveConfig'] }) {
  const [name, setName]   = useState('')
  const [type, setType]   = useState<'adult' | 'kid'>('kid')
  const [color, setColor] = useState(COLORS[0])

  function addPerson() {
    if (!name.trim()) return
    const person: Person = {
      id: crypto.randomUUID(), name: name.trim(), type, color, emoji: type === 'kid' ? '⭐' : '👤',
    }
    saveConfig({ ...config, people: [...config.people, person] })
    setName('')
  }

  function removePerson(id: string) {
    saveConfig({
      ...config,
      people: config.people.filter(p => p.id !== id),
      cal_assignments: config.cal_assignments.filter(a => a.personId !== id),
      chores: config.chores.map(c => ({ ...c, kid_ids: c.kid_ids.filter(k => k !== id) })),
    })
  }

  function updatePerson(id: string, updates: Partial<Person>) {
    saveConfig({ ...config, people: config.people.map(p => p.id === id ? { ...p, ...updates } : p) })
  }

  return (
    <div className="max-w-lg space-y-4">
      <h3 className="font-semibold text-white">Family Members</h3>

      {config.people.map(p => (
        <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="relative flex-shrink-0">
            <div className="h-5 w-5 rounded-full border-2 border-white/20" style={{ background: p.color }} />
            <input type="color" value={p.color} onChange={e => updatePerson(p.id, { color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
          </div>
          <input
            value={p.name}
            onChange={e => updatePerson(p.id, { name: e.target.value })}
            onBlur={() => saveConfig({ ...config })}
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <span className="text-xs text-gray-600">{p.type}</span>
          <button onClick={() => removePerson(p.id)} className="text-gray-600 hover:text-red-400">✕</button>
        </div>
      ))}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addPerson()}
          placeholder="Name"
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-blue-500/50"
        />
        <select value={type} onChange={e => setType(e.target.value as 'adult' | 'kid')} className="rounded-xl border border-white/10 bg-gray-900 px-2 py-2 text-xs">
          <option value="adult">Adult</option>
          <option value="kid">Kid</option>
        </select>
        <div className="relative flex-shrink-0">
          <div className="h-10 w-10 rounded-xl border border-white/10 cursor-pointer" style={{ background: color }} />
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </div>
        <button onClick={addPerson} className="rounded-xl bg-blue-500 px-3 py-2 text-sm font-semibold hover:bg-blue-400">Add</button>
      </div>
    </div>
  )
}

// ── Calendars Tab ─────────────────────────────────────────────

function CalendarsTab({ config, saveConfig, userEmail }: {
  config: ReturnType<typeof useConfig>['config']
  saveConfig: ReturnType<typeof useConfig>['saveConfig']
  userEmail: string
}) {
  const [accounts, setAccounts]   = useState<Array<{ email: string }>>([])
  const [calendars, setCalendars] = useState<Record<string, Array<{ id: string; name: string; color: string }>>>({})

  useEffect(() => {
    fetch('/api/account/connected')
      .then(r => r.json())
      .then(d => {
        setAccounts(d.accounts ?? [])
        d.accounts?.forEach((a: { email: string }) => {
          fetch(`/api/account/calendars?email=${encodeURIComponent(a.email)}`)
            .then(r => r.json())
            .then(data => setCalendars(prev => ({ ...prev, [a.email]: data.calendars ?? [] })))
        })
      })
  }, [])

  function toggleAssignment(cal: { id: string; name: string; color: string }, accountEmail: string, personId: string) {
    const exists = config.cal_assignments.find(a => a.calendarId === cal.id && a.personId === personId)
    const updated = exists
      ? config.cal_assignments.filter(a => !(a.calendarId === cal.id && a.personId === personId))
      : [...config.cal_assignments, { calendarId: cal.id, calendarName: cal.name, accountEmail, personId, color: cal.color }]
    saveConfig({ ...config, cal_assignments: updated })
  }

  function disconnectAccount(email: string) {
    fetch(`/api/account/connected?email=${encodeURIComponent(email)}`, { method: 'DELETE' })
    setAccounts(a => a.filter(x => x.email !== email))
    saveConfig({ ...config, cal_assignments: config.cal_assignments.filter(a => a.accountEmail !== email) })
  }

  return (
    <div className="max-w-lg space-y-4">
      <h3 className="font-semibold text-white">Connected Accounts</h3>

      {accounts.map(account => (
        <div key={account.email} className="rounded-xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-sm font-medium">{account.email}</span>
            <button onClick={() => disconnectAccount(account.email)} className="text-xs text-gray-600 hover:text-red-400">Disconnect</button>
          </div>
          <div className="p-3 space-y-2">
            {(calendars[account.email] ?? []).map(cal => (
              <div key={cal.id} className="rounded-lg border border-white/5 bg-white/3 p-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: cal.color }} />
                  <span className="text-xs font-medium">{cal.name}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {config.people.map(p => {
                    const assigned = config.cal_assignments.some(a => a.calendarId === cal.id && a.personId === p.id)
                    return (
                      <button key={p.id} onClick={() => toggleAssignment(cal, account.email, p.id)}
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold transition ${assigned ? 'text-white' : 'border border-white/15 text-gray-600 hover:text-white'}`}
                        style={assigned ? { background: p.color } : {}}>
                        {p.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <a
        href={`/api/auth/signin/google?callbackUrl=${encodeURIComponent('/dashboard')}`}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-2.5 text-sm text-gray-500 transition hover:text-gray-300"
      >
        + Connect Google Account
      </a>
    </div>
  )
}

// ── Chores Tab ────────────────────────────────────────────────

function ChoresTab({ config, saveConfig, familyPlan }: {
  config: ReturnType<typeof useConfig>['config']
  saveConfig: ReturnType<typeof useConfig>['saveConfig']
  familyPlan: string
}) {
  const rewardsEnabled = familyPlan === 'family_plus'
  const kids = config.people.filter(p => p.type === 'kid')

  const [task, setTask]     = useState('')
  const [days, setDays]     = useState<string[]>(['Mon','Tue','Wed','Thu','Fri'])
  const [period, setPeriod] = useState<Period>('anytime')
  const [points, setPoints] = useState(1)
  const [kidIds, setKidIds] = useState<string[]>([])

  function toggleDay(d: string) { setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]) }
  function toggleKid(id: string) { setKidIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  function addChore() {
    if (!task.trim()) return
    const chore: ChoreDefinition = {
      id: crypto.randomUUID(), task: task.trim(), days, period, points,
      kid_ids: kidIds.length > 0 ? kidIds : kids.map(k => k.id),
    }
    saveConfig({ ...config, chores: [...config.chores, chore] })
    setTask('')
  }

  function removeChore(id: string) {
    saveConfig({ ...config, chores: config.chores.filter(c => c.id !== id) })
  }

  // Rewards management (family_plus only)
  function addReward(kidId: string, reward: Omit<Reward, 'id'>) {
    const kidRewards = config.rewards[kidId] ?? []
    const updated = { ...config.rewards, [kidId]: [...kidRewards, { ...reward, id: crypto.randomUUID() }] }
    saveConfig({ ...config, rewards: updated })
  }

  function removeReward(kidId: string, rewardId: string) {
    const updated = { ...config.rewards, [kidId]: (config.rewards[kidId] ?? []).filter(r => r.id !== rewardId) }
    saveConfig({ ...config, rewards: updated })
  }

  return (
    <div className="max-w-lg space-y-5">
      <h3 className="font-semibold text-white">Chores</h3>

      {/* Existing chores */}
      <div className="space-y-2">
        {config.chores.map(c => (
          <ChoreRow
            key={c.id}
            chore={c}
            kids={kids}
            onSave={updated => saveConfig({ ...config, chores: config.chores.map(x => x.id === c.id ? updated : x) })}
            onRemove={() => removeChore(c.id)}
          />
        ))}
      </div>

      {/* Add chore */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Add chore</p>
        <input value={task} onChange={e => setTask(e.target.value)} onKeyDown={e => e.key === 'Enter' && addChore()}
          placeholder="Task name" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-blue-500/50" />
        <div className="flex flex-wrap gap-1">
          {DAYS.map(d => (
            <button key={d} onClick={() => toggleDay(d)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${days.includes(d) ? 'bg-blue-500 text-white' : 'border border-white/15 text-gray-500'}`}>{d}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="flex-1 rounded-lg border border-white/10 bg-gray-900 px-2 py-1.5 text-xs">
            {PERIODS.map(p => <option key={p.key} value={p.key}>{p.emoji} {p.label}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">⭐</span>
            <input type="number" min="0" max="100" value={points} onChange={e => setPoints(Number(e.target.value))}
              className="w-14 rounded-lg border border-white/10 bg-gray-900 px-2 py-1.5 text-center text-xs" />
          </div>
        </div>
        {kids.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {kids.map(k => (
              <button key={k.id} onClick={() => toggleKid(k.id)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${kidIds.includes(k.id) ? 'text-white' : 'border border-white/15 text-gray-500'}`}
                style={kidIds.includes(k.id) ? { background: k.color } : {}}>{k.name}</button>
            ))}
          </div>
        )}
        <button onClick={addChore} disabled={!task.trim()}
          className="w-full rounded-xl border border-white/15 py-2 text-sm text-gray-400 transition hover:bg-white/10 disabled:opacity-40">
          + Add chore
        </button>
      </div>

      {/* Rewards (family_plus only) */}
      {rewardsEnabled ? (
        <div className="space-y-4">
          <h3 className="font-semibold text-white">Rewards</h3>
          {kids.map(kid => (
            <RewardsSection key={kid.id} kid={kid} rewards={config.rewards[kid.id] ?? []}
              onAdd={r => addReward(kid.id, r)} onRemove={id => removeReward(kid.id, id)} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-gray-400">
          🏆 Rewards &amp; streaks are available on the <strong className="text-white">Family+ plan</strong>.{' '}
          <a href="/billing" className="text-blue-400 hover:underline">Upgrade →</a>
        </div>
      )}
    </div>
  )
}

// ── Chore Row (inline edit) ───────────────────────────────────

function ChoreRow({ chore, kids, onSave, onRemove }: {
  chore: ChoreDefinition
  kids: Person[]
  onSave: (updated: ChoreDefinition) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [task,    setTask]    = useState(chore.task)
  const [days,    setDays]    = useState(chore.days)
  const [period,  setPeriod]  = useState<Period>(chore.period)
  const [points,  setPoints]  = useState(chore.points)
  const [kidIds,  setKidIds]  = useState(chore.kid_ids)

  function open() {
    setTask(chore.task); setDays(chore.days); setPeriod(chore.period)
    setPoints(chore.points); setKidIds(chore.kid_ids)
    setEditing(true)
  }

  function save() {
    if (!task.trim()) return
    onSave({ ...chore, task: task.trim(), days, period, points, kid_ids: kidIds })
    setEditing(false)
  }

  function toggleDay(d: string) { setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]) }
  function toggleKid(id: string) { setKidIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  const periodMeta = PERIODS.find(p => p.key === chore.period)

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{chore.task}</p>
          <p className="text-xs text-gray-500">
            {chore.days.join(', ')} · {periodMeta?.emoji} {chore.period}
            {chore.points > 0 && ` · ⭐ ${chore.points}pts`}
          </p>
        </div>
        <button onClick={open} className="text-gray-600 hover:text-blue-400 text-sm" title="Edit">✏</button>
        <button onClick={onRemove} className="text-gray-600 hover:text-red-400">✕</button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-blue-500/30 bg-white/5 p-4 space-y-3">
      <input
        value={task}
        onChange={e => setTask(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-blue-500/50"
      />
      <div className="flex flex-wrap gap-1">
        {DAYS.map(d => (
          <button key={d} onClick={() => toggleDay(d)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${days.includes(d) ? 'bg-blue-500 text-white' : 'border border-white/15 text-gray-500'}`}>
            {d}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <select value={period} onChange={e => setPeriod(e.target.value as Period)}
          className="flex-1 rounded-lg border border-white/10 bg-gray-900 px-2 py-1.5 text-xs">
          {PERIODS.map(p => <option key={p.key} value={p.key}>{p.emoji} {p.label}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">⭐</span>
          <input type="number" min="0" max="100" value={points} onChange={e => setPoints(Number(e.target.value))}
            className="w-14 rounded-lg border border-white/10 bg-gray-900 px-2 py-1.5 text-center text-xs" />
        </div>
      </div>
      {kids.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-gray-500 self-center">For:</span>
          {kids.map(k => (
            <button key={k.id} onClick={() => toggleKid(k.id)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${kidIds.includes(k.id) ? 'text-white' : 'border border-white/15 text-gray-500'}`}
              style={kidIds.includes(k.id) ? { background: k.color } : {}}>
              {k.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => setEditing(false)}
          className="flex-1 rounded-lg border border-white/15 py-1.5 text-xs text-gray-400 hover:bg-white/5">
          Cancel
        </button>
        <button onClick={save} disabled={!task.trim()}
          className="flex-1 rounded-lg bg-blue-500 py-1.5 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-40">
          Save
        </button>
      </div>
    </div>
  )
}

function RewardsSection({ kid, rewards, onAdd, onRemove }: {
  kid: Person
  rewards: Reward[]
  onAdd: (r: Omit<Reward, 'id'>) => void
  onRemove: (id: string) => void
}) {
  const [name, setName]   = useState('')
  const [emoji, setEmoji] = useState('🎁')
  const [pts, setPts]     = useState(10)

  return (
    <div className="rounded-xl border border-white/10 bg-white/3 p-3">
      <p className="mb-2 text-sm font-semibold" style={{ color: kid.color }}>{kid.name}'s Rewards</p>
      <div className="mb-2 space-y-1.5">
        {rewards.map(r => (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            <span>{r.emoji}</span>
            <span className="flex-1">{r.name}</span>
            <span className="text-xs text-gray-500">⭐ {r.points}</span>
            <button onClick={() => onRemove(r.id)} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <select value={emoji} onChange={e => setEmoji(e.target.value)} className="rounded-lg border border-white/10 bg-gray-900 py-1 text-base">
          {REWARD_EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Reward name"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none" />
        <input type="number" min="1" value={pts} onChange={e => setPts(Number(e.target.value))}
          className="w-14 rounded-lg border border-white/10 bg-gray-900 px-2 py-1 text-center text-xs" />
        <button onClick={() => { if (name.trim()) { onAdd({ name: name.trim(), emoji, points: pts }); setName('') } }}
          className="rounded-lg bg-blue-500/20 px-2 py-1 text-xs text-blue-400 hover:bg-blue-500/30">+ Add</button>
      </div>
    </div>
  )
}

// ── Settings Tab ──────────────────────────────────────────────

function SettingsTab({ config, saveConfig }: { config: ReturnType<typeof useConfig>['config'], saveConfig: ReturnType<typeof useConfig>['saveConfig'] }) {
  const s = config.settings ?? { location: '', use24h: false, theme: 'dark' as const, pin: '1234' }

  function update(updates: Partial<typeof s>) {
    saveConfig({ ...config, settings: { ...s, ...updates } })
  }

  const [newPin, setNewPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinMsg, setPinMsg] = useState('')

  function changePin() {
    if (!/^\d{4}$/.test(newPin)) { setPinMsg('PIN must be 4 digits.'); return }
    if (newPin !== pinConfirm)   { setPinMsg('PINs do not match.'); return }
    update({ pin: newPin })
    setNewPin('')
    setPinConfirm('')
    setPinMsg('PIN updated!')
    setTimeout(() => setPinMsg(''), 2000)
  }

  return (
    <div className="max-w-lg space-y-5">
      <h3 className="font-semibold text-white">Settings</h3>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-widest text-gray-500">Location (for weather)</span>
        <input value={s.location} onChange={e => update({ location: e.target.value })}
          placeholder="e.g. Portland, OR"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-blue-500/50" />
      </label>

      <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <span className="text-sm">24-hour clock</span>
        <input type="checkbox" checked={s.use24h} onChange={e => update({ use24h: e.target.checked })} className="h-4 w-4 accent-blue-500" />
      </label>

      <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <span className="text-sm">Theme</span>
        <select value={s.theme} onChange={e => update({ theme: e.target.value as 'dark' | 'light' })}
          className="rounded-lg border border-white/10 bg-gray-900 px-2 py-1 text-sm">
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Change PIN</p>
        <div className="flex gap-2">
          <input type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={e => setNewPin(e.target.value)}
            placeholder="New PIN" className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
          <input type="password" inputMode="numeric" maxLength={4} value={pinConfirm} onChange={e => setPinConfirm(e.target.value)}
            placeholder="Confirm" className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
          <button onClick={changePin} className="rounded-lg bg-blue-500/20 px-3 py-2 text-xs text-blue-400 hover:bg-blue-500/30">Save</button>
        </div>
        {pinMsg && <p className={`text-xs ${pinMsg.includes('!') ? 'text-green-400' : 'text-red-400'}`}>{pinMsg}</p>}
      </div>

      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <p className="mb-2 text-sm font-semibold text-red-400">Danger zone</p>
        <div className="flex gap-2">
          <a href="/api/account/export" className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-gray-400 hover:text-white">
            Export my data
          </a>
          <a href="/billing" className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-gray-400 hover:text-white">
            Manage billing
          </a>
        </div>
      </div>
    </div>
  )
}
