'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { AccountDeletion } from '@/components/trips/DangerZone'

// design/mocks/13-account.html, "Account" state.
//
// Only two cards ship: identity (with sign out) and the account danger zone.
// The mock's Preferences card — language, appearance — is a deliberate
// placeholder for a later phase; it exists in the mock to show WHY this page
// is separate, not as work for this milestone. Appearance's real design stays
// in mock 09 #appearance until it is built here.
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
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      <p className="mb-6 text-sm text-neutral-500">
        These apply to you, not to any one trip.
      </p>

      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-lg font-semibold">Signed in as</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-teal-500 bg-teal-500/10 text-sm font-bold text-teal-700 dark:text-teal-400"
          >
            {(email.trim()[0] ?? '?').toUpperCase()}
          </span>
          <div className="min-w-0 grow">
            <div className="truncate text-sm font-medium">{email || 'Signed in'}</div>
            <div className="text-xs text-neutral-500">
              Magic-link sign-in — there is no password to manage.
            </div>
          </div>
          <button
            onClick={signOut}
            disabled={busy}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </section>

      <AccountDeletion />
    </main>
  )
}
