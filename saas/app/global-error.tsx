'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global error]', error)
  }, [error])

  return (
    <html lang="en">
      <body className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-white antialiased">
        <p className="text-base font-semibold text-gray-300">Something went wrong.</p>
        <button
          onClick={reset}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-gray-200 hover:bg-white/20"
        >
          Try again
        </button>
      </body>
    </html>
  )
}
