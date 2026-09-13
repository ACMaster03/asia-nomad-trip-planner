'use client'
import { useEffect } from 'react'

// Route error boundary for everything under the root layout. Its one important
// job: a transient server-side failure (the auth check timing out, a slow
// database) must land HERE, with a Retry button and the session intact — not
// on /login, which reads as "you were logged out" (owner note, 2026-09-11).
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  const auth = error.name === 'AuthUnavailableError' || /verify your sign-in/i.test(error.message)
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-3 px-[18px] text-center text-tx">
      <h1 className="font-serif text-[25px] font-semibold">{auth ? 'Couldn’t reach the sign-in service' : 'Something went wrong'}</h1>
      <p className="text-base text-tx2">
        {auth
          ? 'You are still signed in — the server just didn’t answer in time. Try again in a moment.'
          : 'The page hit an error while loading. Try again; if it keeps happening, reload the app.'}
      </p>
      <button onClick={reset} className="mt-2 rounded-[var(--rCtl)] bg-ac px-[18px] py-3 text-base font-semibold text-on">
        Try again
      </button>
    </main>
  )
}
