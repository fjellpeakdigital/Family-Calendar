import { redirect } from 'next/navigation'
import { auth, signIn } from '@/lib/auth'
import { verifyInviteToken } from '@/lib/invite'
import { createClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const payload = verifyInviteToken(token)

  if (!payload) {
    return <InvalidInvite reason="This invite link is invalid or has expired." />
  }

  // Get family info to show in the UI
  const supabase = await createClient()
  const { data: owner } = await supabase
    .from('users')
    .select('name, email')
    .eq('family_id', payload.familyId)
    .eq('role', 'owner')
    .single()

  // If the user is already signed in, accept the invite immediately
  const session = await auth()
  if (session?.user?.email) {
    const userEmail = session.user.email.toLowerCase()

    // Check they're not already in this family
    const { data: existing } = await supabase
      .from('users')
      .select('family_id')
      .eq('email', userEmail)
      .single()

    if (existing?.family_id === payload.familyId) {
      redirect('/dashboard')
    }

    if (existing) {
      // User exists in a different family — move them (or show error)
      return (
        <InviteShell>
          <h1 className="text-2xl font-bold text-white">Already in a family</h1>
          <p className="mt-3 text-gray-400">
            You're signed in as <strong className="text-white">{userEmail}</strong>, which is
            already part of a different family dashboard. Each account can only belong to one family.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            To accept this invite you'll need to sign in with a different Google account.
          </p>
          <a
            href="/dashboard"
            className="mt-6 inline-block rounded-xl border border-white/15 px-5 py-2.5 text-sm text-gray-400 hover:text-white transition"
          >
            Go to my dashboard →
          </a>
        </InviteShell>
      )
    }

    // Add user to the family
    await supabase.from('users').update({ family_id: payload.familyId }).eq('email', userEmail)
    redirect('/dashboard')
  }

  // Not signed in — show the invite landing and a sign-in button
  const ownerName = owner?.name ?? owner?.email?.split('@')[0] ?? 'Someone'

  return (
    <InviteShell>
      <div className="mb-6 text-5xl">🏠</div>
      <h1 className="text-2xl font-bold text-white">
        {ownerName} invited you to their family dashboard
      </h1>
      <p className="mt-3 text-gray-400">
        FamilyDash is a shared wall display with your family's calendars, kids' chore charts,
        live weather, and a rewards system.
      </p>

      {payload.email && (
        <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-300">
          This invite is for <strong>{payload.email}</strong>. Sign in with that Google account to accept.
        </div>
      )}

      <form
        className="mt-8"
        action={async () => {
          'use server'
          // After Google sign-in, redirect back here to complete the join
          await signIn('google', { redirectTo: `/invite/${token}` })
        }}
      >
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-5 py-3.5 text-sm font-bold text-gray-900 shadow transition hover:bg-gray-100 active:scale-95"
        >
          <GoogleIcon />
          Sign in with Google to join
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-gray-600">
        This invite link expires in 7 days.
      </p>
    </InviteShell>
  )
}

// ── Shells ─────────────────────────────────────────────────────

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-gray-950 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-sm">
        {children}
      </div>
    </main>
  )
}

function InvalidInvite({ reason }: { reason: string }) {
  return (
    <InviteShell>
      <div className="mb-4 text-4xl">⚠️</div>
      <h1 className="text-xl font-bold text-white">Invalid invite</h1>
      <p className="mt-3 text-sm text-gray-400">{reason}</p>
      <a
        href="/"
        className="mt-6 inline-block rounded-xl border border-white/15 px-5 py-2.5 text-sm text-gray-400 hover:text-white transition"
      >
        Go to homepage
      </a>
    </InviteShell>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}
