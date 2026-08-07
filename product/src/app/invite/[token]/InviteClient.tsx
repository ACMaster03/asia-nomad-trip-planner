'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { acceptInviteByToken, type InvitePreview } from '@/lib/trips/invites'

// Invite accept — handoff frame 06b, on the same 2a "valley morning" wash as
// /login (frame 01 notes the wash is shared by exactly these two screens).
// One page, two moments:
//   before auth — the 06b card: "{inviter} invited you to plan together",
//     trip card, prefilled email, Accept & sign in → signInWithOtp with
//     next=/invite/[token] so the magic link lands back here;
//   after auth — a 06c-style "Joining the trip…" beat while
//     accept_invite_by_token runs, then straight into /welcome?short=1
//     (Anna skips trip setup, keeps the 3 personal steps).
// Send behavior mirrors /login: Sending… → "Sent · again in N s" (60 s,
// disabled) → "Send again", honeydew chip confirms.

type Phase =
  | 'idle' // 06b card, waiting for the tap
  | 'sending'
  | 'sent'
  | 'accepting' // session found — magic link brought her back
  | 'mismatch' // signed in, but not with the invited email
  | 'dead' // token unknown / revoked / (for a non-accepter) already used

export default function InviteClient({
  token,
  preview,
}: {
  token: string
  preview: InvitePreview | null
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>(preview ? 'idle' : 'dead')
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  // StrictMode re-runs effects; accepting twice is tolerated server-side but
  // would race the redirect, so gate the mount check like the auth callback.
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const sb = createClient()
    sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) return // no session — stay on the pre-auth card
      setPhase('accepting')
      try {
        await acceptInviteByToken(sb, token)
        // A pending invite routes into the short personalisation; a revisit of
        // an already-accepted link (preview is null then) goes straight home.
        router.replace(preview ? '/welcome?short=1' : '/dashboard')
      } catch {
        // Same generic RPC error for every cause; the one we can explain is a
        // session under the WRONG email — only tellable when a preview exists.
        setPhase(preview ? 'mismatch' : 'dead')
      }
    })
  }, [router, token, preview])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function send() {
    if (!preview || phase === 'sending' || cooldown > 0) return
    setPhase('sending')
    const sb = createClient()
    const { error } = await sb.auth.signInWithOtp({
      email: preview.email,
      // back HERE after the exchange — the mount effect then accepts + routes
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/invite/${token}` },
    })
    if (error) {
      setError(error.message)
      setPhase('idle')
    } else {
      setError('')
      setPhase('sent')
      setCooldown(60)
    }
  }

  // ---- 06c-style interstitial while the accept RPC runs -------------------
  if (phase === 'accepting') {
    return (
      <main
        className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6"
        style={{ background: 'var(--washLight)', color: 'var(--washInk)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
        <img src="/brand/livhold-mark.png" alt="" width={56} height={56} className="lv-shimmer" />
        <div className="font-serif text-[22px] font-medium">Joining the trip…</div>
      </main>
    )
  }

  // ---- dead link: unknown, revoked, or used by someone else ----------------
  if (phase === 'dead') {
    return (
      <main
        className="flex min-h-dvh flex-col px-6 pb-8 pt-10"
        style={{ background: 'var(--washLogin)', color: 'var(--washInk)' }}
      >
        <div className="mx-auto flex w-full max-w-sm flex-col">
          <Brand />
          <h1 className="mt-8 text-balance text-center font-serif text-[34px] font-medium leading-[1.2] tracking-[-.01em]">
            This invite isn&apos;t
            <br />
            live anymore
          </h1>
          <div
            className="mt-6 rounded-2xl px-3.5 py-2.5 text-center text-base leading-normal text-[#1F2A24] backdrop-blur-[3px]"
            style={{ background: 'rgba(255,255,255,.72)' }}
          >
            It may have been accepted already or withdrawn. Ask the person who sent it for a fresh
            link — or sign in if you already joined.
          </div>
          <a
            href="/login"
            className="mt-4 flex items-center justify-center rounded-[22px] bg-ac py-4 text-[17px] font-semibold text-on"
          >
            Sign in
          </a>
        </div>
      </main>
    )
  }

  // ---- frame 06b ----------------------------------------------------------
  const p = preview! // phases below only exist while a preview is present
  const label =
    phase === 'sending'
      ? 'Sending…'
      : cooldown > 0
        ? `Sent · again in ${cooldown} s`
        : phase === 'sent'
          ? 'Send again'
          : 'Accept & sign in'

  return (
    <main
      className="flex min-h-dvh flex-col px-6 pb-8 pt-10"
      style={{ background: 'var(--washLogin)', color: 'var(--washInk)' }}
    >
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <Brand />

        <h1 className="mt-7 text-balance text-center font-serif text-[34px] font-medium leading-[1.2] tracking-[-.01em]">
          {p.invited_by_name} invited you
          <br />
          to plan together
        </h1>

        <div className="mt-5 rounded-[22px] bg-sf p-4 text-center text-tx">
          <div className="font-serif text-[19px] font-semibold">{p.trip_name}</div>
          <div className="mt-1 text-base leading-normal text-tx2">
            <span className="font-semibold text-ac2-deep">
              {p.role === 'editor' ? 'you join as a full co-editor' : 'you join as a viewer'}
            </span>
            {p.role === 'editor'
              ? ' - plans, money, memories, all of it.'
              : ' - plans, money and memories, read-only.'}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-[11px]">
          {/* fixed light values on purpose: chips sit over the photographic
              wash in both themes (same rule as /login, frames 01/06b) */}
          <div
            className="rounded-[22px] px-4 py-[15px] text-center text-base font-medium text-[#1F2A24]"
            style={{ background: 'rgba(255,255,255,.82)', border: '1.5px solid rgba(31,42,36,.16)' }}
          >
            {p.email}
          </div>
          <button
            type="button"
            onClick={send}
            disabled={phase === 'sending' || cooldown > 0}
            className={
              'flex items-center justify-center gap-[9px] rounded-[22px] bg-ac py-4 text-[17px] font-semibold text-on transition-opacity duration-200 ' +
              (cooldown > 0 ? 'opacity-55' : phase === 'sending' ? 'opacity-85' : '')
            }
          >
            {phase === 'sending' && (
              <i className="block size-[17px] animate-spin rounded-full border-[2.4px] border-white/35 border-t-white" />
            )}
            {label}
          </button>

          {phase === 'sent' && (
            <div className="lv-enter rounded-[22px] bg-tag px-4 py-3.5 text-base font-medium leading-normal text-tag-ink">
              ✓ Check your email for the sign-in link.
            </div>
          )}
          {phase === 'mismatch' && (
            <div className="lv-enter rounded-[22px] border border-warn-line bg-warn-soft px-4 py-3.5 text-base leading-normal text-warn">
              This invite was sent to {p.email} — you&apos;re signed in as someone else. Accept it
              from that account, or ask for an invite to yours.
            </div>
          )}
          {error && (
            <div className="lv-enter rounded-[22px] border border-warn-line bg-warn-soft px-4 py-3.5 text-base leading-normal text-warn">
              {error}
            </div>
          )}

          <div
            className="rounded-2xl px-3.5 py-2.5 text-center text-base leading-normal text-[#1F2A24] backdrop-blur-[3px]"
            style={{ background: 'rgba(255,255,255,.72)' }}
          >
            A magic link confirms it&apos;s you. The trip is already set up - you only pick your own
            preferences.
          </div>
        </div>

        <div className="flex-1" />

        <div
          className="mt-4 rounded-2xl px-3.5 py-2.5 text-center text-[13px] leading-normal text-[#1F2A24] backdrop-blur-[3px]"
          style={{ background: 'rgba(255,255,255,.72)' }}
        >
          By continuing you agree to the{' '}
          <span className="font-medium text-ac2-deep underline">Terms</span> and{' '}
          <span className="font-medium text-ac2-deep underline">Privacy Policy</span>.
        </div>
      </div>
    </main>
  )
}

function Brand() {
  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
      <img src="/brand/livhold-mark.png" alt="Livhold" width={64} height={64} />
      <span className="text-lg font-medium uppercase tracking-[.18em] text-ac2-deep">Livhold</span>
    </div>
  )
}
