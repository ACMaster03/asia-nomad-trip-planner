'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { deleteTrip, leaveTrip, deleteAccount } from '@/lib/trips/danger'
import { useTripScope } from '@/lib/trips/TripScope'
import { useTripRole } from '@/lib/trips/useTripRole'

// Settings → Danger zone (mock 09's "danger zone (delete/leave trip)" state,
// plus account deletion).
//
// Closes a promise the phone test plan already made: F9 tells you to "delete
// the Phone test trip from Settings", which has never been possible — so every
// dogfood test trip is still sitting in production.
//
// CONFIRMATION IS BY TYPING, not by an OK button. These actions are silent and
// total: no undo, no tombstone, and the photos are gone from the bucket too.
// A confirm() dialog is one mis-tap on a phone; typing the trip's own name
// cannot happen by accident.
function ConfirmBox({
  phrase,
  label,
  cta,
  busy,
  onConfirm,
}: {
  phrase: string
  label: React.ReactNode
  cta: string
  busy: boolean
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')
  const ok = typed.trim() === phrase
  return (
    <div className="mt-3 rounded border border-red-300 p-3 dark:border-red-900">
      <label className="block text-sm">
        {label}
        <input
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={phrase}
          autoComplete="off"
        />
      </label>
      <button
        onClick={onConfirm}
        disabled={!ok || busy}
        className="mt-2 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {busy ? 'Working…' : cta}
      </button>
    </div>
  )
}

// ACCOUNT: everything, everywhere. Lives on /account rather than in the trip
// Danger zone below, because it must stay reachable WITHOUT a loaded trip:
// deleting your last trip — or losing access to the active one — must never
// take the "erase me" button with it (dogfood 2026-07-26, mock 13).
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
    <section className="mt-10 rounded-lg border border-red-300 p-4 dark:border-red-900">
      <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
      <p className="mb-4 mt-1 text-sm text-neutral-500">This cannot be undone.</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 grow">
          <div className="text-sm font-medium">Delete my account</div>
          <div className="text-xs text-neutral-500">
            Deletes every trip you own and all of their photos, removes you from trips you
            joined, and erases your sign-in. You will be signed out immediately.
          </div>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="rounded border border-red-400 px-3 py-1.5 text-sm text-red-700 dark:text-red-400"
        >
          Delete account…
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {open && (
        <ConfirmBox
          phrase="DELETE MY ACCOUNT"
          label={<>Type <b>DELETE MY ACCOUNT</b> to confirm</>}
          cta="Permanently delete my account"
          busy={delAccount.isPending}
          onConfirm={() => delAccount.mutate()}
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
    <section className="mt-10 rounded-lg border border-red-300 p-4 dark:border-red-900">
      <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
      <p className="mt-1 text-sm text-neutral-500">These cannot be undone.</p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* OWNER: delete the whole trip. */}
      {canAdminister && (
        <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 grow">
              <div className="text-sm font-medium">Delete this trip</div>
              <div className="text-xs text-neutral-500">
                Removes the plan, the ledger, every check-in and note, all photos, and every
                follow link. Co-editors and viewers lose access immediately.
              </div>
            </div>
            <button
              onClick={() => setOpen(open === 'trip' ? null : 'trip')}
              className="rounded border border-red-400 px-3 py-1.5 text-sm text-red-700 dark:text-red-400"
            >
              Delete trip…
            </button>
          </div>
          {open === 'trip' && (
            <ConfirmBox
              phrase={tripName}
              label={
                <>
                  Type <b>{tripName}</b> to confirm
                </>
              }
              cta="Delete this trip forever"
              busy={busy}
              onConfirm={() => delTrip.mutate()}
            />
          )}
        </div>
      )}

      {/* MEMBER: leave someone else's trip. Mutually exclusive with the above —
          an owner cannot leave their own trip, they delete it or hand it over. */}
      {!canAdminister && role !== 'none' && (
        <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 grow">
              <div className="text-sm font-medium">Leave this trip</div>
              <div className="text-xs text-neutral-500">
                Gives up your access. The trip and everything in it stay with the owner, and they
                can invite you again.
              </div>
            </div>
            <button
              onClick={() => setOpen(open === 'leave' ? null : 'leave')}
              className="rounded border border-red-400 px-3 py-1.5 text-sm text-red-700 dark:text-red-400"
            >
              Leave trip…
            </button>
          </div>
          {open === 'leave' && (
            <ConfirmBox
              phrase="LEAVE"
              label={<>Type <b>LEAVE</b> to confirm</>}
              cta="Leave this trip"
              busy={busy}
              onConfirm={() => leave.mutate()}
            />
          )}
        </div>
      )}

    </section>
  )
}
