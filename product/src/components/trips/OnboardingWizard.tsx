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

const input =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base font-medium text-tx outline-none transition-colors duration-[180ms] focus:border-ac'

// Step dots per handoff frames 04–06: past = solid hunter ✓, current = mauve-soft
// circle with its label beside it, future = quiet outline.
function Dots({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Basics', 'Home base', 'Invite']
  return (
    <ol className="flex items-center justify-center gap-2 text-base font-medium">
      {[1, 2, 3].map((n, i) => (
        <li key={n} className="flex items-center gap-2">
          {i > 0 && <span className="h-px w-[18px] bg-ln3" aria-hidden />}
          <span className="flex items-center gap-1.5">
            <span
              className={
                'flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] transition-colors duration-[250ms] ' +
                (n < step
                  ? 'border-ac bg-ac text-on'
                  : n === step
                    ? 'border-ac2-line bg-ac2-soft text-ac2-deep'
                    : 'border-ln3 text-tx3')
              }
            >
              {n < step ? '✓' : n}
            </span>
            {n === step && <span className="text-tx">{labels[i]}</span>}
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

  // Wizard done → straight into the personalisation flow (handoff section F).
  function finish() {
    if (trip) setTripId(trip.id)
    onDone?.()
    router.push('/welcome')
  }

  const sub = step === 1 ? 'Three quick steps - only the first is required.' : step === 2 ? 'Step 2 of 3 · optional' : 'Last step · optional'
  const card = 'lv-enter rounded-[calc(var(--r)+2px)] bg-sf p-4 pt-[18px] text-tx'
  const cta = 'rounded-[calc(var(--r)-2px)] bg-ac px-5 py-3.5 text-base font-semibold text-on disabled:opacity-50'
  const warn = 'mt-3 rounded-[calc(var(--r)-2px)] border border-warn-line bg-warn-soft px-3 py-2 text-base text-warn'

  return (
    <div
      className="flex min-h-dvh flex-col gap-3.5 px-4 pb-7 pt-6"
      style={{ background: 'var(--washLight)', color: 'var(--washInk)' }}
    >
      <div className="text-center">
        <h1 className="font-serif text-[25px] font-semibold leading-tight">Let&rsquo;s set up your trip</h1>
        <p className="mt-1.5 text-base text-tx2">{sub}</p>
      </div>
      <Dots step={step} />

      <div className="mx-auto w-full max-w-xl">
        {step === 1 && (
          <>
            <div className={card}>
              <h2 className="mb-3 font-serif text-[19px] font-semibold">Trip basics</h2>
              <TripMetaForm onSubmit={(v) => { if (!create.isPending) create.mutate(v) }} busy={create.isPending} />
              {create.isError && <p className={warn}>Could not create the trip — try again.</p>}
            </div>
            <div
              className="mt-3.5 rounded-2xl px-3.5 py-2.5 text-center text-base leading-normal text-[#1F2A24] backdrop-blur-[3px]"
              style={{ background: 'rgba(255,255,255,.72)' }}
            >
              This is the only hard commit - closing after it still leaves a usable trip.
            </div>
          </>
        )}

        {step === 2 && (
          <div className={card}>
            <h2 className="mb-1 font-serif text-[19px] font-semibold">
              Home base <span className="font-sans text-base font-normal text-tx3">- optional</span>
            </h2>
            <p className="mb-3 text-base leading-normal text-tx2">Where the trip starts from - sets your departure default and home context.</p>
            <label className="block text-base font-medium text-tx2">
              City, country
              <input className={input} value={homeBase} onChange={(e) => setHomeBase(e.target.value)} placeholder="Budapest, Hungary" autoFocus />
            </label>
            {saveHome.isError && <p className={warn}>Could not save — you can set this later in Settings.</p>}
            <div className="mt-4 flex items-center gap-3.5">
              <button
                onClick={() => (homeBase.trim() ? saveHome.mutate() : setStep(3))}
                disabled={saveHome.isPending}
                className={cta + ' flex-1'}
              >
                {saveHome.isPending ? 'Saving…' : homeBase.trim() ? 'Save & continue →' : 'Continue →'}
              </button>
              <button onClick={() => setStep(3)} className="inline-flex min-h-11 items-center text-base font-medium text-ac2 underline">Skip</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={card}>
            <h2 className="mb-1 font-serif text-[19px] font-semibold">
              Invite your partner <span className="font-sans text-base font-normal text-tx3">- optional</span>
            </h2>
            <p className="mb-3 text-base leading-normal text-tx2">
              Full co-editor access when they sign in with this email - revocable any time in Settings → Sharing.
            </p>
            {inviteSent ? (
              <p className="lv-enter rounded-[var(--r)] bg-tag px-4 py-3.5 text-base font-medium leading-normal text-tag-ink">
                ✓ Invite recorded for {inviteEmail.trim().toLowerCase()}. They accept it from the banner on their own screen.
              </p>
            ) : (
              <>
                <label className="block text-base font-medium text-tx2">
                  Their email
                  <input type="email" className={input} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="partner@example.com" autoFocus />
                </label>
                {invite.isError && <p className={warn}>Could not record the invite — you can do it later in Settings.</p>}
              </>
            )}
            <div className="mt-4 flex items-center gap-3.5">
              {!inviteSent && (
                <button
                  onClick={() => invite.mutate()}
                  disabled={invite.isPending || !inviteEmail.includes('@')}
                  className={cta + ' flex-1'}
                >
                  {invite.isPending ? 'Sending…' : 'Send invite'}
                </button>
              )}
              <button onClick={finish} className={inviteSent ? cta + ' flex-1' : 'inline-flex min-h-11 items-center text-base font-medium text-ac2 underline'}>
                {inviteSent ? 'Continue →' : 'Skip →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
