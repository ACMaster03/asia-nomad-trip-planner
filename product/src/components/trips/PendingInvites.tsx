'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchPendingInvites, acceptInvite, declineInvite } from '@/lib/trips/invites'
import { setSelectedTripId } from '@/lib/trips/queries'
import { tk } from '@/lib/trips/keys'
import { useTripScope } from '@/lib/trips/TripScope'

// "X invited you to Y" — the invitee's half of the invite flow (migration 25).
//
// Mounted in the (app) layout rather than on one screen: an invite is about a
// trip you cannot navigate to yet, so there is no natural page for it to live
// on, and burying it would recreate the old bug in a nicer costume (invites
// that exist but can never be acted on).
//
// Renders NOTHING in the overwhelmingly common case — nobody is invited to
// anything — so it costs one cheap RPC per app open and no layout space.
export function PendingInvites() {
  const sb = createClient()
  const qc = useQueryClient()
  const router = useRouter()
  const { setTripId } = useTripScope()
  const [error, setError] = useState<string | null>(null)

  const invites = useQuery({
    queryKey: tk.pendingInvites,
    queryFn: () => fetchPendingInvites(sb),
    staleTime: 60_000,
  })

  const accept = useMutation({
    mutationFn: (inviteId: string) => acceptInvite(sb, inviteId),
    onSuccess: async (tripId) => {
      setError(null)
      // Switch to the trip they just joined. Accepting an invite is an act of
      // wanting to SEE the thing — landing back on your own trip with a silent
      // success toast would be a worse answer than the one the user asked for.
      // Persisted per account (migration 07) so the phone agrees with the laptop.
      await setSelectedTripId(sb, tripId).catch(() => {})
      setTripId(tripId)
      qc.invalidateQueries({ queryKey: tk.pendingInvites })
      qc.invalidateQueries({ queryKey: tk.trips })
      // The (app) layout resolves the active trip AND the role server-side;
      // without a refresh the new trip renders under the old role.
      router.refresh()
    },
    onError: () => setError('Could not accept the invite — it may have been withdrawn.'),
  })

  const decline = useMutation({
    mutationFn: (inviteId: string) => declineInvite(sb, inviteId),
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: tk.pendingInvites })
    },
    onError: () => setError('Could not decline the invite — please try again.'),
  })

  const list = invites.data ?? []
  if (!list.length) return null

  const busy = accept.isPending || decline.isPending

  return (
    <div className="mx-auto max-w-5xl px-6 pt-4">
      {list.map((inv) => (
        <div
          key={inv.invite_id}
          className="mb-3 rounded-lg border border-teal-300 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-950/30"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 grow">
              <div className="text-sm">
                <b>{inv.invited_by_name}</b> invited you to <b>{inv.trip_name}</b>
              </div>
              <div className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                {inv.role === 'editor'
                  ? 'As a co-editor — you can plan the trip together.'
                  : 'As a viewer — you can see everything, but not change it.'}
              </div>
            </div>
            <button
              onClick={() => accept.mutate(inv.invite_id)}
              disabled={busy}
              className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {accept.isPending ? 'Joining…' : 'Accept'}
            </button>
            <button
              onClick={() => decline.mutate(inv.invite_id)}
              disabled={busy}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
            >
              Decline
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      ))}
    </div>
  )
}
