'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { AccountDeletion } from '@/components/trips/DangerZone'
import { ActiveTripCard } from '@/app/(app)/settings/ActiveTripCard'

// LIVHOLD v1 frame 29.
//
// Identity (with sign out), Your trips (active / switch / ＋ New trip — the
// account-level list frame 29 places here rather than on the trip-scoped
// Settings), and the account danger zone. Deletion (29b/c) arms only on the
// exact phrase DELETE MY ACCOUNT and lands on /goodbye.
export default function AccountClient({ email }: { email: string }) {
  const sb = createClient()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    await sb.auth.signOut().catch(() => {})
    qc.clear()
    // Full reload rather than a router push: every cache in memory belongs to
    // the session we just ended.
    window.location.href = '/login'
  }

  return (
    <main className="lv-enter mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px]">
      <div>
        <h1 className="font-serif text-[25px] font-semibold">Account</h1>
        <p className="mt-[5px] text-base leading-normal text-tx2">
          These apply to you, not to any one trip.
        </p>
      </div>

      <section className="rounded-[var(--r)] bg-sf p-4">
        <h2 className="font-serif text-[19px] font-semibold">Signed in as</h2>
        <div className="mt-3 flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 flex-none items-center justify-center rounded-full border-[1.5px] border-ac2-line bg-ac2-soft text-base font-semibold text-ac2-deep"
          >
            {(email.trim()[0] ?? '?').toUpperCase()}
          </span>
          <div className="min-w-0 grow">
            <div className="truncate text-base font-semibold">{email || 'Signed in'}</div>
            <div className="mt-0.5 text-base text-tx2">
              Magic-link sign-in — no password to manage.
            </div>
          </div>
        </div>
        <button
          onClick={signOut}
          disabled={busy}
          className="mt-[13px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ac2 py-3 text-base font-semibold text-ac2 disabled:opacity-50"
        >
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </section>

      <ActiveTripCard />

      <AccountDeletion />
    </main>
  )
}
