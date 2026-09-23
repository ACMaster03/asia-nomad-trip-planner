'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createOtpClient } from '@/lib/supabase/otp'
import { DEFAULT_NEXT, safeNextPath } from '@/lib/auth/safeNext'
import { createClient } from '@/lib/supabase/client'
import { humanAuthError, looksLikeNoPasswordSet } from '@/lib/auth/authError'

// Login — handoff frame 01 (the only screen on the 2a "valley morning" wash;
// invite-accept shares it in Phase 4). Behavior follows the rig: sending stays
// on this screen, the button label cycles Sending… → "Sent · again in N s"
// (60s cooldown, disabled) → "Send again", and the honeydew chip confirms.
// Apple sign-in: DEFERRED (owner decision 2026-08-06).
//
// TWO WAYS IN (2026-09-14). The magic link stays the hero — it is what every
// existing account uses and what the onboarding copy assumes. Password sign-in
// sits behind a text link, for accounts that have SET one in Account → Password.
// It can only ever be a second key to a door you already have: signing up happens
// through the magic link, and `signInWithPassword` creates nothing.
//
// It earns its place twice over. Google Play requires reusable credentials for
// app review and says so explicitly for apps gated behind one-time passwords,
// which is exactly what a magic link is. And it is simply the more dependable
// way in on the road: no email round trip means no waiting on a mail server and
// no in-app-browser handoff (see lib/supabase/otp.ts for what that handoff
// cost us once already).
type Mode = 'link' | 'password'

export default function Login() {
  const [mode, setMode] = useState<Mode>('link')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  // One cooldown covers BOTH emails on purpose: Supabase rate-limits sends per
  // address, so a reset requested right after a magic link is refused by the
  // server anyway. Better to show the wait than to earn a 429.
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')

  // Where to land after sign-in. A follow link sends people here with
  // ?next=/follow/<token> so the follow they started can finish; anything
  // off-site is refused by safeNextPath.
  const nextPath = () => safeNextPath(new URLSearchParams(window.location.search).get('next'))

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  function switchTo(next: Mode) {
    setMode(next)
    // Carry the address across — it is the one field both ways in share — but
    // never a stale outcome from the other mode.
    setError('')
    setSent(false)
    setResetSent(false)
    setPassword('')
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!email || sending || cooldown > 0) return
    setSending(true)
    // Send-only, NON-PKCE client (lib/supabase/otp.ts). PKCE bound the link to
    // this browser's stored verifier, so opening it from a mail app's in-app
    // browser failed with "link invalid or expired" — see that file for the
    // full account. Without a verifier the link is redeemable anywhere:
    // /auth/confirm verifies a token_hash server-side once the Supabase email
    // template points there (docs/AUTH-EMAIL-TEMPLATE.md), and until it does,
    // /auth/callback accepts the tokens Supabase puts in the URL fragment.
    const sb = createOtpClient()
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: nextPath() === DEFAULT_NEXT
          ? `${window.location.origin}/auth/callback`
          : `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
      },
    })
    setSending(false)
    if (error) {
      setError(
        humanAuthError(error, "We couldn't send the link just now. Please try again in a moment."),
      )
    } else {
      setError('')
      setSent(true)
      setCooldown(60)
    }
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password || sending) return
    setSending(true)
    // The SESSION-OWNING client, never the send-only one in lib/supabase/otp.ts.
    // That client is persistSession:false, so signing in through it would return
    // a perfectly successful result, write no cookie, and leave the server guard
    // in (app)/layout.tsx to bounce the traveller straight back to this screen —
    // a failure that reads as a bug in the guard, nowhere near its cause.
    const sb = createClient()
    const { error } = await sb.auth.signInWithPassword({ email, password })
    setSending(false)
    if (error) {
      setError(
        humanAuthError(error, "We couldn't sign you in just now. Please try again in a moment."),
      )
      return
    }
    setError('')
    // A full navigation, not router.push: the session cookies were written a
    // moment ago and every server component on the other side has to read them.
    // Account's sign-out reloads for the mirror-image reason.
    window.location.href = nextPath()
  }

  async function sendReset() {
    if (!email || sending || cooldown > 0) return
    setSending(true)
    // Implicit (non-PKCE) client again, and for exactly the reason the magic
    // link uses it: this puts a LINK in an email, and reset links get opened
    // from the mail app. redirectTo lands on /auth/callback, which honours
    // ?next= — a shape that works whether or not the Supabase "Reset Password"
    // template has been repointed at /auth/confirm, so this needs no dashboard
    // change to start working.
    const sb = createOtpClient()
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/account')}`,
    })
    setSending(false)
    if (error) {
      setError(
        humanAuthError(
          error,
          "We couldn't send the reset link just now. Please try again in a moment.",
        ),
      )
    } else {
      setError('')
      setResetSent(true)
      setCooldown(60)
    }
  }

  const linkLabel = sending
    ? 'Sending…'
    : cooldown > 0
      ? `Sent · again in ${cooldown} s`
      : sent
        ? 'Send again'
        : 'Send magic link'

  const chip =
    'rounded-2xl px-3.5 py-2.5 text-center text-base leading-normal text-[#1F2A24] backdrop-blur-[3px]'
  const chipBg = { background: 'rgba(255,255,255,.72)' }

  return (
    <main
      className="flex min-h-dvh flex-col px-6 pb-8 pt-[calc(40px+env(safe-area-inset-top))]"
      style={{ background: 'var(--washLogin)', color: 'var(--washInk)' }}
    >
      <div className="mx-auto flex w-full max-w-sm flex-col">
        {/* brand stack — arrives alone at center, drifts up (globals.css) */}
        <div className="lv-brand mt-6 flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
          <img src="/brand/livhold-mark.png" alt="Livhold" width={64} height={64} />
          <span className="text-lg font-medium uppercase tracking-[.18em] text-ac2-deep">Livhold</span>
          <div className="-mt-1 text-[15px] tracking-[.06em] opacity-60">the living journey, held together</div>
        </div>

        <div className="lv-reveal">
          <h1 className="mt-8 text-balance text-center font-serif text-[40px] font-medium leading-[1.16] tracking-[-.01em]">
            Sign in,
            <br />
            traveller
          </h1>

          <form onSubmit={mode === 'link' ? send : signIn} className="mt-7 flex flex-col gap-[11px]">
            <label className="rounded-[22px] border-[1.5px] border-ln2 bg-sf/90 px-4 py-3.5 text-tx transition-[border-color,box-shadow] duration-[180ms] focus-within:border-ac focus-within:shadow-[0_0_0_4px_var(--acSoft)]">
              <span className="block text-base uppercase tracking-[.1em] text-tx2">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-[5px] w-full bg-transparent text-base font-medium outline-none placeholder:text-tx3"
              />
            </label>

            {mode === 'password' && (
              <label className="rounded-[22px] border-[1.5px] border-ln2 bg-sf/90 px-4 py-3.5 text-tx transition-[border-color,box-shadow] duration-[180ms] focus-within:border-ac focus-within:shadow-[0_0_0_4px_var(--acSoft)]">
                <span className="block text-base uppercase tracking-[.1em] text-tx2">Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-[5px] w-full bg-transparent text-base font-medium outline-none placeholder:text-tx3"
                />
              </label>
            )}

            <button
              type="submit"
              disabled={sending || (mode === 'link' && cooldown > 0)}
              className={
                'flex items-center justify-center gap-[9px] rounded-[22px] bg-ac py-4 text-[17px] font-semibold text-on transition-opacity duration-200 ' +
                (mode === 'link' && cooldown > 0 ? 'opacity-55' : sending ? 'opacity-85' : '')
              }
            >
              {sending && (
                <i className="block size-[17px] animate-spin rounded-full border-[2.4px] border-white/35 border-t-white" />
              )}
              {mode === 'link' ? linkLabel : sending ? 'Signing in…' : 'Sign in'}
            </button>

            {sent && mode === 'link' && (
              <div className="lv-enter rounded-[22px] bg-tag px-4 py-3.5 text-base font-medium leading-normal text-tag-ink">
                ✓ Check your email for the sign-in link.
              </div>
            )}
            {resetSent && mode === 'password' && (
              <div className="lv-enter rounded-[22px] bg-tag px-4 py-3.5 text-base font-medium leading-normal text-tag-ink">
                ✓ Check your email. The link opens your account so you can set a new password.
              </div>
            )}
            {error && (
              <div className="lv-enter rounded-[22px] border border-warn-line bg-warn-soft px-4 py-3.5 text-base leading-normal text-warn">
                {error}
                {mode === 'password' && looksLikeNoPasswordSet(error) && (
                  <>
                    {' '}
                    If you have never set a password on this account, sign in with a magic link and
                    add one under Account → Password.
                  </>
                )}
              </div>
            )}

            {mode === 'password' && (
              <button
                type="button"
                onClick={sendReset}
                disabled={sending || cooldown > 0 || !email}
                className="self-center py-1 text-base font-medium text-ac2-deep underline disabled:opacity-55"
              >
                {cooldown > 0 ? `Email me again in ${cooldown} s` : 'Forgot your password?'}
              </button>
            )}

            {/* frosted chips — fixed light values on purpose: they sit over the
                photographic wash in both themes (handoff frame 01) */}
            <div className={chip} style={chipBg}>
              {mode === 'link' ? (
                <>
                  No password - the link signs you in.
                  <br />
                  First sign-in starts the 3-step setup.
                </>
              ) : (
                <>
                  For accounts that have set a password.
                  <br />
                  No email to wait for - useful on a slow connection.
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => switchTo(mode === 'link' ? 'password' : 'link')}
              className="self-center py-1 text-base font-medium text-ac2-deep underline"
            >
              {mode === 'link' ? 'Use a password instead' : 'Email me a link instead'}
            </button>

            {/* These were <span>s until 2026-09-14 — the sentence claimed two
                documents that did not exist, and Play will not list an app
                without a reachable privacy policy. Both pages are public. */}
            <div className={'mt-0.5 ' + chip + ' text-[13px]'} style={chipBg}>
              By continuing you agree to the{' '}
              <Link href="/terms" className="font-medium text-ac2-deep underline">
                Terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="font-medium text-ac2-deep underline">
                Privacy Policy
              </Link>
              .
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
