'use client'

import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app error]', error)
  }, [error])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-gray-950 text-white">
      <p className="text-base font-semibold text-gray-300">Something went wrong.</p>
      <button
        onClick={reset}
        className="rounded-lg bg-white/10 px-4 py-2 text-sm text-gray-200 hover:bg-white/20"
      >
        Try again
      </button>
    </div>
  )
}
