'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeNextPath } from '@/lib/auth/safeNext'

// Landing spot for an emailed sign-in link. THREE shapes can arrive here, and
// the difference is exactly the cross-browser bug (see lib/supabase/otp.ts):
//
//   #access_token=…&refresh_token=…  implicit — Supabase already verified the
//                                    token itself, so this works in ANY browser.
//                                    What login now issues.
//   #error=…&error_description=…     implicit, refused (genuinely expired/used).
//   ?code=…                          legacy PKCE — needs the verifier THIS
//                                    browser stored when the link was requested.
//                                    Kept working for links already in inboxes.
//
// Fragments never reach the server, which is why this is a client page.
export default function CallbackClient() {
  const router = useRouter()
  // An auth code is single-use: React 18 dev StrictMode re-runs effects, and a
  // second exchange would fail and bounce a VALID sign-in to the error page.
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const query = new URLSearchParams(window.location.search)
    // Read the fragment BEFORE touching the client, and strip its leading '#'.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    // relative same-origin paths only — never follow a ?next= off-site
    const next = safeNextPath(query.get('next'))

    // Carry the real reason through. "Invalid or expired" covered two opposite
    // failures — a stale link, and a verifier that was never in this browser —
    // and they need opposite fixes. Discarding the provider's own words is what
    // made this take a day to place.
    const fail = (reason: string) =>
      router.replace(`/auth/auth-code-error?reason=${encodeURIComponent(reason.slice(0, 200))}`)

    // Supabase refused it before we ever got here. It reports that in the
    // FRAGMENT on the implicit flow and in the QUERY on the redirect flow, and
    // checking only the fragment made a stated refusal look like an empty link.
    const refused =
      hash.get('error_description') ??
      query.get('error_description') ??
      hash.get('error') ??
      query.get('error')
    if (refused) {
      const code_ = hash.get('error_code') ?? query.get('error_code')
      fail(code_ ? `${refused} (${code_})` : refused)
      return
    }

    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')
    if (accessToken && refreshToken) {
      createClient()
        .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) return fail(error.message)
          // Drop the tokens out of the address bar before moving on — no reason
          // to leave them in history or hand them to the next page's referrer.
          window.history.replaceState(null, '', window.location.pathname)
          router.replace(next)
        })
        .catch((e) => fail(e instanceof Error ? e.message : String(e)))
      return
    }

    const code = query.get('code')
    if (!code) {
      // Say WHAT arrived, not just what didn't. Parameter NAMES only — never
      // their values, which are credentials. "no sign-in token" on its own sent
      // us hunting blind once already; the names alone identify the flow that
      // produced the link and whether something upstream stripped it.
      const seen = [...query.keys(), ...[...hash.keys()].map((k) => `#${k}`)]
      fail(
        seen.length
          ? `no sign-in token; the link carried: ${seen.join(', ')}`
          : 'no sign-in token, and the link carried nothing at all — the address may have lost it in a redirect',
      )
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
