'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Login — handoff frame 01 (the only screen on the 2a "valley morning" wash;
// invite-accept shares it in Phase 4). Behavior follows the rig: sending stays
// on this screen, the button label cycles Sending… → "Sent · again in N s"
// (60s cooldown, disabled) → "Send again", and the honeydew chip confirms.
// Apple sign-in: DEFERRED (owner decision 2026-08-06) — magic link only.

export default function Login() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!email || sending || cooldown > 0) return
    setSending(true)
    const sb = createClient()
    const { error } = await sb.auth.signInWithOtp({
      // PKCE (browser client default) delivers the link as ?code= → /auth/callback
      // exchanges it. /auth/confirm (token_hash) stays available for templates that
      // use the OTP flow instead.
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setSending(false)
    if (error) {
      setError(error.message)
    } else {
      setError('')
      setSent(true)
      setCooldown(60)
    }
  }

  const label = sending
    ? 'Sending…'
    : cooldown > 0
      ? `Sent · again in ${cooldown} s`
      : sent
        ? 'Send again'
        : 'Send magic link'

  return (
    <main
      className="flex min-h-dvh flex-col px-6 pb-8 pt-10"
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

          <form onSubmit={send} className="mt-7 flex flex-col gap-[11px]">
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
            <button
              type="submit"
              disabled={sending || cooldown > 0}
              className={
                'flex items-center justify-center gap-[9px] rounded-[22px] bg-ac py-4 text-[17px] font-semibold text-on transition-opacity duration-200 ' +
                (cooldown > 0 ? 'opacity-55' : sending ? 'opacity-85' : '')
              }
            >
              {sending && (
                <i className="block size-[17px] animate-spin rounded-full border-[2.4px] border-white/35 border-t-white" />
              )}
              {label}
            </button>

            {sent && (
              <div className="lv-enter rounded-[22px] bg-tag px-4 py-3.5 text-base font-medium leading-normal text-tag-ink">
                ✓ Check your email for the sign-in link.
              </div>
            )}
            {error && (
              <div className="lv-enter rounded-[22px] border border-warn-line bg-warn-soft px-4 py-3.5 text-base leading-normal text-warn">
                {error}
              </div>
            )}

            {/* frosted chips — fixed light values on purpose: they sit over the
                photographic wash in both themes (handoff frame 01) */}
            <div
              className="rounded-2xl px-3.5 py-2.5 text-center text-base leading-normal text-[#1F2A24] backdrop-blur-[3px]"
              style={{ background: 'rgba(255,255,255,.72)' }}
            >
              No password - the link signs you in.
              <br />
              First sign-in starts the 3-step setup.
            </div>
            <div
              className="mt-0.5 rounded-2xl px-3.5 py-2.5 text-center text-[13px] leading-normal text-[#1F2A24] backdrop-blur-[3px]"
              style={{ background: 'rgba(255,255,255,.72)' }}
            >
              By continuing you agree to the{' '}
              <span className="font-medium text-ac2-deep underline">Terms</span> and{' '}
              <span className="font-medium text-ac2-deep underline">Privacy Policy</span>.
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
