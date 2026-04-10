import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PLAN_DETAILS } from '@/lib/stripe'

export default async function Home() {
  const session = await auth()
  if (session) redirect('/dashboard')

  return (
    <div className="min-h-full bg-gray-950 text-white">
      <Nav />
      <Hero />
      <Features />
      <Pricing />
      <Footer />
    </div>
  )
}

// ── Nav ────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-gray-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏠</span>
          <span className="text-lg font-bold tracking-tight">FamilyDash</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#pricing" className="text-sm text-gray-400 hover:text-white transition">Pricing</a>
          <Link
            href="/login"
            className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-400"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  )
}

// ── Hero ───────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-20">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[600px] w-[600px] rounded-full bg-blue-500/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/5 px-4 py-1.5 text-sm text-blue-400">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          Free to get started — no credit card required
        </div>

        <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
          Your family's{' '}
          <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
            shared dashboard
          </span>
        </h1>

        <p className="mx-auto mb-10 max-w-2xl text-xl leading-relaxed text-gray-400">
          A beautiful always-on display for your wall tablet. Family calendars, live weather,
          kids' chore charts, and a rewards system — all in one place.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className="rounded-2xl bg-blue-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 hover:shadow-blue-500/30 active:scale-95"
          >
            Get started free →
          </Link>
          <a
            href="#features"
            className="rounded-2xl border border-white/10 px-8 py-4 text-base font-semibold text-gray-400 transition hover:border-white/20 hover:text-white"
          >
            See how it works
          </a>
        </div>

        {/* Dashboard preview */}
        <div className="relative mx-auto mt-16 max-w-5xl">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-gray-900 shadow-2xl shadow-black/50">
            <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
              <span className="ml-3 text-xs text-gray-600">familydash.app/dashboard</span>
            </div>
            <DashboardPreview />
          </div>
        </div>
      </div>
    </section>
  )
}

function DashboardPreview() {
  const events = [
    { name: 'Sarah', color: '#58A6FF', title: 'School pickup', time: '3:00 PM' },
    { name: 'Mike',  color: '#FF7EB3', title: 'Dentist appt',  time: '4:30 PM' },
    { name: 'Sarah', color: '#58A6FF', title: 'Soccer practice', time: '6:00 PM' },
  ]
  const chores = [
    { name: 'Emma', color: '#3FB950', done: 3, total: 4, pts: 28 },
    { name: 'Jake', color: '#D29922', done: 2, total: 3, pts: 15 },
  ]
  return (
    <div className="flex divide-x divide-white/5 bg-gray-950 text-left">
      {/* Calendar column */}
      <div className="flex-1 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-600">Today</p>
        <div className="space-y-2">
          {events.map((e, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/3 px-3 py-2.5">
              <div className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: e.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{e.title}</p>
                <p className="text-xs" style={{ color: e.color }}>{e.name}</p>
              </div>
              <p className="flex-shrink-0 text-xs text-gray-600">{e.time}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Chores column */}
      <div className="flex-1 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-600">Chores</p>
        <div className="space-y-3">
          {chores.map((k, i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-white/3 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: k.color }}>{k.name}</span>
                <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-xs font-bold text-yellow-400">
                  ⭐ {k.pts} pts
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${(k.done / k.total) * 100}%`, background: k.color }} />
              </div>
              <p className="mt-1 text-xs text-gray-600">{k.done} of {k.total} done</p>
            </div>
          ))}
        </div>
      </div>
      {/* Weather column */}
      <div className="flex-1 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-600">Weather</p>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/3 p-5 text-center">
          <span className="text-4xl">⛅</span>
          <span className="text-3xl font-bold">72°</span>
          <span className="text-xs text-gray-500">Partly cloudy</span>
          <div className="mt-1 flex gap-3 text-xs text-gray-600">
            <span>H: 76°</span>
            <span>L: 61°</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Features ───────────────────────────────────────────────────

const FEATURES = [
  {
    icon: '📅',
    title: 'Family calendar',
    desc: 'Connect every family member\'s Google Calendar. Events show up color-coded by person, side-by-side in day, week, or month view.',
  },
  {
    icon: '✅',
    title: 'Chore charts',
    desc: 'Assign morning, afternoon, and evening chores to each kid. They tap to check off — progress bars and points update instantly.',
  },
  {
    icon: '⭐',
    title: 'Rewards & points',
    desc: 'Kids earn points for every chore. Set up custom rewards they can claim — extra screen time, a pizza night, anything you choose.',
  },
  {
    icon: '🌤',
    title: 'Live weather',
    desc: 'Current conditions and a 7-day forecast for your city, always visible. No API key needed — free and accurate.',
  },
  {
    icon: '🔒',
    title: 'Privacy first',
    desc: 'Calendar events are fetched live and never stored on our servers. We only keep the minimal data needed to run the app.',
  },
  {
    icon: '📱',
    title: 'Made for tablets',
    desc: 'Designed for a wall-mounted iPad or Android tablet. Runs full-screen, looks great from across the room, works offline.',
  },
]

function Features() {
  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-4xl font-bold">Everything your family needs</h2>
          <p className="text-lg text-gray-400">No subscriptions required to get started. Set up in minutes.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(f => (
            <div key={f.title} className="rounded-2xl border border-white/8 bg-white/3 p-6">
              <div className="mb-4 text-3xl">{f.icon}</div>
              <h3 className="mb-2 text-lg font-bold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Pricing ────────────────────────────────────────────────────

function Pricing() {
  const plans = [
    {
      id: 'free' as const,
      badge: null,
      highlight: false,
    },
    {
      id: 'family' as const,
      badge: 'Most popular',
      highlight: true,
    },
    {
      id: 'family_plus' as const,
      badge: 'Best value',
      highlight: false,
    },
  ]

  return (
    <section id="pricing" className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-4xl font-bold">Simple, honest pricing</h2>
          <p className="text-lg text-gray-400">Start free. Upgrade when your family grows.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map(({ id, badge, highlight }) => {
            const details = PLAN_DETAILS[id]
            return (
              <div
                key={id}
                className={`relative flex flex-col rounded-2xl border p-7 ${
                  highlight
                    ? 'border-blue-500/40 bg-blue-500/5 shadow-lg shadow-blue-500/10'
                    : 'border-white/10 bg-white/3'
                }`}
              >
                {badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-4 py-1 text-xs font-bold">
                    {badge}
                  </div>
                )}
                <div className="mb-5">
                  <h3 className="text-lg font-bold">{details.name}</h3>
                  <div className="mt-3 flex items-end gap-1">
                    <span className="text-4xl font-extrabold">
                      {details.price.monthly === 0 ? 'Free' : `$${details.price.monthly}`}
                    </span>
                    {details.price.monthly > 0 && (
                      <span className="mb-1 text-gray-500">/mo</span>
                    )}
                  </div>
                  {details.price.yearly > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      or ${details.price.yearly}/yr — save ${details.price.monthly * 12 - details.price.yearly}
                    </p>
                  )}
                </div>

                <ul className="mb-7 flex-1 space-y-3">
                  {details.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-gray-300">
                      <span className="mt-0.5 flex-shrink-0 text-green-400">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/login"
                  className={`block rounded-xl py-3 text-center text-sm font-bold transition active:scale-95 ${
                    highlight
                      ? 'bg-blue-500 text-white hover:bg-blue-400'
                      : 'border border-white/15 text-gray-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {id === 'free' ? 'Get started free' : `Start with ${details.name}`}
                </Link>
              </div>
            )
          })}
        </div>

        <p className="mt-8 text-center text-sm text-gray-600">
          All paid plans include a 14-day free trial. Cancel any time — no questions asked.
          <br />
          Payments processed by Stripe. We never store your card details.
        </p>
      </div>
    </section>
  )
}

// ── Footer ─────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-white/5 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>🏠</span>
          <span>FamilyDash — your family's shared wall dashboard</span>
        </div>
        <div className="flex gap-6 text-sm text-gray-600">
          <Link href="/privacy" className="hover:text-gray-400 transition">Privacy</Link>
          <Link href="/terms" className="hover:text-gray-400 transition">Terms</Link>
          <Link href="/login" className="hover:text-gray-400 transition">Sign in</Link>
        </div>
      </div>
    </footer>
  )
}
