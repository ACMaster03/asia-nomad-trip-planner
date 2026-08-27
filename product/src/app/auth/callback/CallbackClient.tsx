'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeNextPath } from '@/lib/auth/safeNext'

export default function CallbackClient() {
  const router = useRouter()
  // An auth code is single-use: React 18 dev StrictMode re-runs effects, and a
  // second exchange would fail and bounce a VALID sign-in to the error page.
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    // relative same-origin paths only — never follow a ?next= off-site
    const next = safeNextPath(params.get('next'))
    // Carry the real reason to the error page. "Invalid or expired" covers two
    // completely different failures — a genuinely stale link, and a PKCE
    // verifier that was never in THIS browser because the link was opened from
    // a mail app's in-app browser — and they need opposite fixes. Discarding
    // the provider's own words is what made this outage take a day to place.
    const fail = (reason: string) =>
      router.replace(`/auth/auth-code-error?reason=${encodeURIComponent(reason.slice(0, 200))}`)

    if (!code) {
      fail('no code in the link')
      return
    }
    createClient()
      .auth.exchangeCodeForSession(code)
      .then(({ error }) => (error ? fail(error.message) : router.replace(next)))
      .catch((e) => fail(e instanceof Error ? e.message : String(e)))
  }, [router])

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6"
      style={{ background: 'var(--washLight)', color: 'var(--washInk)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
      <img src="/brand/livhold-mark.png" alt="" width={56} height={56} className="lv-shimmer" />
      <div className="font-serif text-[22px] font-medium">Opening your trip…</div>
      <div className="text-center text-base leading-normal text-tx3">
        Checking your link. This takes a second -
        <br />
        if it expired, we&apos;ll send a fresh one.
      </div>
    </main>
  )
}
