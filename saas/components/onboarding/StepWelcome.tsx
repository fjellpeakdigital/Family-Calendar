'use client'

export default function StepWelcome({
  userEmail,
  onNext,
}: {
  userEmail: string
  onNext: () => void
}) {
  return (
    <div className="text-center">
      <div className="mb-4 text-6xl">🏠</div>
      <h1 className="mb-2 text-3xl font-bold">Welcome to FamilyDash</h1>
      <p className="mb-2 text-gray-400">Signed in as <span className="text-white">{userEmail}</span></p>
      <p className="mb-8 text-gray-500">
        Let's get your family dashboard set up. It only takes a couple of minutes.
        You can always change everything later from the admin panel.
      </p>

      <div className="mb-8 grid gap-3 text-left">
        {[
          { emoji: '👥', title: 'Add family members',       desc: 'Parents, kids — anyone who shares the calendar' },
          { emoji: '📅', title: 'Connect Google Calendars', desc: 'Each person\'s events will show on the dashboard' },
          { emoji: '✅', title: 'Set up chores',            desc: 'Daily tasks for kids, with optional point rewards' },
        ].map(item => (
          <div key={item.title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <span className="text-2xl">{item.emoji}</span>
            <div>
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-gray-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="w-full rounded-xl bg-blue-500 py-3 font-semibold transition hover:bg-blue-400"
      >
        Get started →
      </button>
    </div>
  )
}
