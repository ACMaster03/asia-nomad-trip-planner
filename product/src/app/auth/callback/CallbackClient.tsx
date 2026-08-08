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
    if (!code) {
      router.replace('/auth/auth-code-error')
      return
    }
    createClient()
      .auth.exchangeCodeForSession(code)
      .then(({ error }) => router.replace(error ? '/auth/auth-code-error' : next))
      .catch(() => router.replace('/auth/auth-code-error'))
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
