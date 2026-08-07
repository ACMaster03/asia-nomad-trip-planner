'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { deleteTrip, leaveTrip, deleteAccount } from '@/lib/trips/danger'
import { useTripScope } from '@/lib/trips/TripScope'
import { useTripRole } from '@/lib/trips/useTripRole'

// Settings → Danger zone (LIVHOLD v1 frames 28/28b/28c, plus 29b/29c for the
// account variant).
//
// Closes a promise the phone test plan already made: F9 tells you to "delete
// the Phone test trip from Settings", which has never been possible — so every
// dogfood test trip is still sitting in production.
//
// CONFIRMATION IS BY TYPING, not by an OK button. These actions are silent and
// total: no undo, no tombstone, and the photos are gone from the bucket too.
// A confirm() dialog is one mis-tap on a phone; typing the exact phrase cannot
// happen by accident. Two steps per the handoff: step 1 explains what goes,
// step 2 is the phrase alone — Back reopens step 1.
function ConfirmFlow({
  title,
  explanation,
  phrase,
  label,
  cta,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  explanation: string
  phrase: string
  label: React.ReactNode
  cta: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [typed, setTyped] = useState('')
  const ok = typed.trim() === phrase

  return (
    <div className="lv-enter mt-3 flex flex-col gap-[14px] rounded-[var(--r)] border-[1.5px] border-ac2-line bg-sf p-4">
      <div className="flex items-baseline gap-[9px]">
        <span className="font-serif text-[21px] font-semibold text-ac2">
          {step === 1 ? title : 'Type to confirm'}
        </span>
        <span className="text-base tabular-nums text-tx3">step {step} of 2</span>
      </div>

      {step === 1 ? (
        <>
          <p className="text-base leading-normal text-tx2">{explanation}</p>
          <div className="flex gap-[9px]">
            <button
              onClick={() => setStep(2)}
              className="flex-1 rounded-[calc(var(--r)-2px)] bg-ac2 py-3.5 text-base font-semibold text-white"
            >
              {cta.split(' ')[0]}…
            </button>
            <button
              onClick={onCancel}
              className="rounded-[calc(var(--r)-2px)] border-[1.5px] border-ln3 px-[18px] py-3.5 text-base font-semibold text-tx2"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-base leading-normal text-tx2">This is the point of no return.</p>
          <label className="block text-base">
            {label}
            <input
              className="mt-[9px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base tabular-nums focus:border-ac focus:outline-none"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={phrase}
              autoComplete="off"
            />
          </label>
          <div className="flex gap-[9px]">
            <button
              onClick={onConfirm}
              disabled={!ok || busy}
              className="flex-1 rounded-[calc(var(--r)-2px)] bg-ac2 py-3.5 text-base font-semibold text-white disabled:opacity-45"
            >
              {busy ? 'Working…' : cta}
            </button>
            <button
              onClick={() => setStep(1)}
              className="rounded-[calc(var(--r)-2px)] border-[1.5px] border-ln3 px-[18px] py-3.5 text-base font-semibold text-tx2"
            >
              Back
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ACCOUNT: everything, everywhere. Lives on /account rather than in the trip
// Danger zone below, because it must stay reachable WITHOUT a loaded trip:
// deleting your last trip — or losing access to the active one — must never
// take the "erase me" button with it (dogfood 2026-07-26, frame 29).
export function AccountDeletion() {
  const sb = createClient()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const delAccount = useMutation({
    mutationFn: () => deleteAccount(sb),
    onSuccess: () => {
      qc.clear()
      // /goodbye, not /login: this is the only confirmation there is (no email,
      // no undo), and landing on a sign-in form reads as "you got logged out"
      // rather than "it worked". Full reload, not a router push — everything in
      // memory belongs to a user who no longer exists.
      window.location.href = '/goodbye'
    },
    onError: () => setError('Could not delete your account — please try again.'),
  })

  return (
    <section className="mt-3 rounded-[var(--r)] border-[1.5px] border-ac2-line bg-sf p-4">
      <h2 className="font-serif text-[19px] font-semibold text-ac2">Danger zone</h2>
      <p className="mt-1 text-base text-tx2">This cannot be undone.</p>
      <div className="mt-[13px] border-t border-ln pt-[13px]">
        <div className="text-base font-semibold">Delete my account</div>
        <div className="mt-1 text-base leading-normal text-tx2">
          Every trip you own goes with it, along with their photos. You are removed from trips
          you joined, and signed out straight away.
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="mt-3 rounded-[calc(var(--r)-3px)] border-[1.5px] border-ac2 px-[15px] py-3 text-base font-semibold text-ac2"
          >
            Delete my account…
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-base text-ac2">{error}</p>}
      {open && (
        <ConfirmFlow
          title="Delete your account?"
          explanation="Every trip you own goes with it, along with their photos. You are removed from trips you joined, and signed out straight away."
          phrase="DELETE MY ACCOUNT"
          label={<>Type <b>DELETE MY ACCOUNT</b> to confirm</>}
          cta="Delete my account"
          busy={delAccount.isPending}
          onConfirm={() => delAccount.mutate()}
          onCancel={() => setOpen(false)}
        />
      )}
    </section>
  )
}

export function DangerZone({ tripName }: { tripName: string }) {
  const sb = createClient()
  const qc = useQueryClient()
  const router = useRouter()
  const { tripId, setTripId } = useTripScope()
  const { role, canAdminister, isResolved } = useTripRole()
  const [open, setOpen] = useState<null | 'trip' | 'leave'>(null)
  const [error, setError] = useState<string | null>(null)

  // Both trip paths end with this screen gone: Settings renders the
  // create-a-trip empty state once the scope is null. That IS the
  // confirmation — a success banner here would be unmounted before it painted,
  // which is why neither path tries to show one.
  const afterTripGone = () => {
    setOpen(null)
    setTripId(null)
    qc.clear() // the cached document, events and role all refer to a dead trip
    router.refresh()
  }

  const delTrip = useMutation({
    mutationFn: () => deleteTrip(sb, tripId!),
    onSuccess: afterTripGone,
    onError: () => setError('Could not delete the trip. Nothing was removed — please try again.'),
  })

  const leave = useMutation({
    mutationFn: () => leaveTrip(sb, tripId!),
    onSuccess: afterTripGone,
    onError: () => setError('Could not leave the trip — please try again.'),
  })

  // Withheld until the role is known, so nobody is offered "Leave trip" for a
  // trip they own or "Delete trip" for one they don't.
  if (!isResolved) return null
  const busy = delTrip.isPending || leave.isPending

  return (
    <section className="mt-3">
      {error && <p className="mb-3 text-base text-ac2">{error}</p>}

      {/* OWNER: delete the whole trip. Frame 28 renders this as a single quiet
          mauve row at the very bottom — the weight lives in the two-step
          confirm, not in the resting state. */}
      {canAdminister && (
        <>
          {open !== 'trip' && (
            <button
              onClick={() => setOpen('trip')}
              className="flex w-full items-center gap-3 rounded-[var(--r)] bg-sf p-4 text-left"
            >
              <span className="flex-1 text-base font-semibold text-ac2">Delete this trip</span>
              <span aria-hidden className="text-[20px] text-ac2">›</span>
            </button>
          )}
          {open === 'trip' && (
            <ConfirmFlow
              title="Delete this trip?"
              explanation="Everything in it goes — stops, stays, transport, extras and the whole ledger — for everyone on the trip, along with every photo and follow link."
              phrase={tripName}
              label={
                <>
                  Type <b>{tripName}</b> to confirm
                </>
              }
              cta="Delete this trip"
              busy={busy}
              onConfirm={() => delTrip.mutate()}
              onCancel={() => setOpen(null)}
            />
          )}
        </>
      )}

      {/* MEMBER: leave someone else's trip. Mutually exclusive with the above —
          an owner cannot leave their own trip, they delete it or hand it over. */}
      {!canAdminister && role !== 'none' && (
        <>
          {open !== 'leave' && (
            <button
              onClick={() => setOpen('leave')}
              className="flex w-full items-center gap-3 rounded-[var(--r)] bg-sf p-4 text-left"
            >
              <span className="flex-1 text-base font-semibold text-ac2">Leave this trip</span>
              <span aria-hidden className="text-[20px] text-ac2">›</span>
            </button>
          )}
          {open === 'leave' && (
            <ConfirmFlow
              title="Leave this trip?"
              explanation="Gives up your access. The trip and everything in it stay with the owner, and they can invite you again."
              phrase="LEAVE"
              label={<>Type <b>LEAVE</b> to confirm</>}
              cta="Leave this trip"
              busy={busy}
              onConfirm={() => leave.mutate()}
              onCancel={() => setOpen(null)}
            />
          )}
        </>
      )}
    </section>
  )
}
