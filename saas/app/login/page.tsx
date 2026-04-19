import { signIn } from '@/lib/auth'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function LoginPage() {
  const session = await auth()
  if (session) redirect('/dashboard')

  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / wordmark */}
        <div className="text-center">
          <div className="text-4xl mb-2">🏠</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">FamilyDash</h1>
          <p className="mt-2 text-sm text-gray-400">
            Your family's shared wall dashboard
          </p>
        </div>

        {/* Sign-in card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
          <h2 className="mb-6 text-center text-lg font-semibold text-white">
            Sign in to get started
          </h2>

          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/dashboard' })
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-100 active:scale-95"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </form>

          <form
            action={async () => {
              'use server'
              await signIn('microsoft-entra-id', { redirectTo: '/dashboard' })
            }}
            className="mt-3"
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-95"
            >
              <MicrosoftIcon />
              Continue with Microsoft
            </button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-gray-600">
            <div className="h-px flex-1 bg-white/10" />
            or
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form
            action={async (formData: FormData) => {
              'use server'
              const email = String(formData.get('email') ?? '').trim().toLowerCase()
              if (!email) return
              await signIn('resend', { email, redirectTo: '/dashboard' })
            }}
            className="space-y-2"
          >
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400/50"
            />
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-95"
            >
              Send me a sign-in link
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-500">
            By signing in you agree to our{' '}
            <a href="/privacy" className="underline hover:text-gray-300">Privacy Policy</a>
            {' '}and{' '}
            <a href="/terms" className="underline hover:text-gray-300">Terms of Service</a>.
          </p>
        </div>

        {/* Privacy callout */}
        <p className="text-center text-xs text-gray-600">
          🔒 Calendar events are never stored on our servers.
          <br />
          Fetched live, shown to you, then discarded.
        </p>
      </div>
    </main>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  )
}

function MicrosoftIcon() {
  // Official Microsoft four-square logo, simplified.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1"  y="1"  width="7.5" height="7.5" fill="#F25022" />
      <rect x="9.5" y="1"  width="7.5" height="7.5" fill="#7FBA00" />
      <rect x="1"  y="9.5" width="7.5" height="7.5" fill="#00A4EF" />
      <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900" />
    </svg>
  )
}
