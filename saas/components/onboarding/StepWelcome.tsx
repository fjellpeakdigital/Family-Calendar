'use client'

import { Users, CalendarDays, CheckSquare, LayoutDashboard } from 'lucide-react'

export default function StepWelcome({
  userEmail,
  onNext,
}: {
  userEmail: string
  onNext: () => void
}) {
  return (
    <div className="text-center">
      <div className="mb-4 flex justify-center"><LayoutDashboard className="h-14 w-14 text-white/80" strokeWidth={1.25} /></div>
      <h1 className="mb-2 text-3xl font-bold">Welcome to FamilyDash</h1>
      <p className="mb-2 text-gray-400">Signed in as <span className="text-white">{userEmail}</span></p>
      <p className="mb-8 text-gray-500">
        Let's get your family dashboard set up. It only takes a couple of minutes.
        You can always change everything later from the admin panel.
      </p>

      <div className="mb-8 grid gap-3 text-left">
        {[
          { Icon: Users,        title: 'Add family members',       desc: 'Parents, kids — anyone who shares the calendar' },
          { Icon: CalendarDays, title: 'Connect Google Calendars', desc: 'Each person\'s events will show on the dashboard' },
          { Icon: CheckSquare,  title: 'Set up chores',            desc: 'Daily tasks for kids, with optional point rewards' },
        ].map(item => (
          <div key={item.title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <item.Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-white/60" strokeWidth={1.5} />
            <div>
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-gray-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="w-full rounded-xl bg-white/15 py-3 font-semibold ring-1 ring-white/20 transition hover:bg-white/20"
      >
        Get started →
      </button>
    </div>
  )
}
