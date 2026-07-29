'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createTrip, createInvite, writeState, setSelectedTripId } from '@/lib/trips/queries'
import { tk } from '@/lib/trips/keys'
import { useTripScope } from '@/lib/trips/TripScope'
import { TripMetaForm } from './TripMetaForm'
import type { NewTripInput } from '@/lib/trips/newTrip'
import type { Trip } from '@/lib/trips/types'

// Onboarding wizard (M1 item 6; endframe: mock 01 "wizard" state).
// Step 1 (trip basics) is the only hard commit — it creates the trip. Steps 2
// (home base) and 3 (invite partner) write onto that trip and are skippable;
// closing after step 1 still leaves a usable trip, exactly per the mock note.
// The same settings live on in Settings → Trip / Sharing.

const input = 'mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900'

function Dots({ step }: { step: 1 | 2 | 3 }) {
  const items: { n: 1 | 2 | 3; label: string; opt?: boolean }[] = [
    { n: 1, label: 'Trip basics' },
    { n: 2, label: 'Home base', opt: true },
    { n: 3, label: 'Invite partner', opt: true },
  ]
  return (
    <ol className="mb-5 flex items-center justify-center gap-2 text-xs">
      {items.map((it, i) => (
        <li key={it.n} className="flex items-center gap-2">
          {i > 0 && <span className="h-px w-6 bg-neutral-300 dark:bg-neutral-700" aria-hidden />}
          <span className={`flex items-center gap-1.5 ${step === it.n ? 'font-semibold' : 'text-neutral-500'}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${step >= it.n ? 'border-teal-600 bg-teal-600/10 text-teal-700 dark:text-teal-400' : 'border-neutral-300 dark:border-neutral-700'}`}>{it.n}</span>
            {it.label}
            {it.opt && <span className="text-neutral-400">· optional</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function OnboardingWizard({ onDone }: { onDone?: () => void }) {
  const sb = createClient()
  const qc = useQueryClient()
  const router = useRouter()
  const { setTripId } = useTripScope()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [homeBase, setHomeBase] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSent, setInviteSent] = useState(false)

  // Step 1 — the hard commit. Cache + per-account selection update mirror
  // CreateTripEmptyState's old flow; the wizard then continues onto the trip.
  //
  // newTripId is the create's idempotency key: ONE id per wizard mount, so a
  // double-fired submit (double click / Enter+click in the same frame, before
  // isPending disables the button) or a retry after a lost response inserts
  // the same primary key and resolves to the already-created trip instead of
  // making a sibling. See createTrip in lib/trips/queries.ts.
  const [newTripId] = useState(() => crypto.randomUUID())
  const create = useMutation({
    mutationFn: (values: NewTripInput) => createTrip(sb, values, newTripId),
    onSuccess: async (t) => {
      qc.setQueryData(tk.trip(t.id), t)
      qc.invalidateQueries({ queryKey: tk.trips })
      await setSelectedTripId(sb, t.id).catch(() => {}) // best-effort — local scope carries on
      setTrip(t)
      setTripId(t.id)
      // Re-render the server layout: the nav's Live-tab gate reads the active
      // trip server-side and would otherwise stay stale until a hard reload.
      router.refresh()
      setStep(2)
    },
  })

  // Step 2 — writes meta.homeBase through the rev-guarded writeState.
  const saveHome = useMutation({
    mutationFn: async () => {
      if (!trip) throw new Error('No trip yet')
      const next = { ...trip.state, meta: { ...trip.state.meta, homeBase: homeBase.trim() } }
      const newRev = await writeState(sb, trip.id, next, trip.state_rev)
      const updated: Trip = { ...trip, state: next, state_rev: newRev }
      setTrip(updated)
      qc.setQueryData(tk.trip(trip.id), updated)
    },
    onSuccess: () => setStep(3),
  })

  // Step 3 — records a co-editor invite (migration 02/06 RLS keeps it role-safe).
  const invite = useMutation({
    mutationFn: async () => {
      if (!trip) throw new Error('No trip yet')
      await createInvite(sb, trip.id, inviteEmail, 'editor')
    },
    onSuccess: () => setInviteSent(true),
  })

  function finish() {
    if (trip) setTripId(trip.id)
    onDone?.()
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-center text-2xl font-semibold">Let’s set up your trip</h1>
      <p className="mb-5 text-center text-sm text-neutral-500">Three quick steps — only the first one is required.</p>
      <Dots step={step} />

      {step === 1 && (
        <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="mb-3 text-lg font-semibold">Trip basics</h2>
          <TripMetaForm onSubmit={(v) => { if (!create.isPending) create.mutate(v) }} busy={create.isPending} />
          {create.isError && <p className="mt-3 text-sm text-red-600">Could not create the trip — try again.</p>}
        </div>
      )}

      {step === 2 && (
        <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="mb-1 text-lg font-semibold">Home base <span className="text-sm font-normal text-neutral-400">— optional</span></h2>
          <p className="mb-3 text-sm text-neutral-500">Where the trip starts from — sets your departure default and home context.</p>
          <label className="block text-sm">
            City, country
            <input className={input} value={homeBase} onChange={(e) => setHomeBase(e.target.value)} placeholder="Budapest, Hungary" autoFocus />
          </label>
          {saveHome.isError && <p className="mt-3 text-sm text-red-600">Could not save — you can set this later in Settings.</p>}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => (homeBase.trim() ? saveHome.mutate() : setStep(3))}
              disabled={saveHome.isPending}
              className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saveHome.isPending ? 'Saving…' : homeBase.trim() ? 'Save & continue →' : 'Continue →'}
            </button>
            <button onClick={() => setStep(3)} className="text-sm text-neutral-500 hover:underline">Skip</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="mb-1 text-lg font-semibold">Invite your partner <span className="text-sm font-normal text-neutral-400">— optional</span></h2>
          <p className="mb-3 text-sm text-neutral-500">
            Full co-editor access when they sign in with this email — revocable any time in Settings → Sharing.
          </p>
          {inviteSent ? (
            <p className="text-sm text-emerald-600">✓ Invite recorded for {inviteEmail.trim().toLowerCase()}.</p>
          ) : (
            <>
              <label className="block text-sm">
                Their email
                <input type="email" className={input} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="partner@example.com" autoFocus />
              </label>
              {invite.isError && <p className="mt-3 text-sm text-red-600">Could not record the invite — you can do it later in Settings.</p>}
            </>
          )}
          <div className="mt-4 flex items-center gap-3">
            {!inviteSent && (
              <button
                onClick={() => invite.mutate()}
                disabled={invite.isPending || !inviteEmail.includes('@')}
                className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {invite.isPending ? 'Sending…' : 'Send invite'}
              </button>
            )}
            <button onClick={finish} className={inviteSent ? 'rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white' : 'text-sm text-neutral-500 hover:underline'}>
              {inviteSent ? 'Open my trip →' : 'Skip & open my trip →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
