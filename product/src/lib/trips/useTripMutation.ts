'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { writeState } from './queries'
import { tk } from './keys'
import type { TripState, Trip } from './types'

type StateUpdater = (cur: TripState) => TripState

// Generic editor for the trip `state` document (segments/stays/transport/extras/
// meta/rates). Applies an updater against the freshest cached state, persists ONLY
// the state column, optimistically updates, and serializes writes so rapid edits
// can't clobber each other. Mirrors useLedgerMutation.
//
// Concurrency: writeState carries the cached state_rev (migration 06). If another
// device wrote in between, it throws RevConflictError → onError rolls the
// optimistic update back and onSettled refetches the fresh document; the tabs
// surface the conflict via the SaveError banner (which inspects mutation.error).
export function useTripMutation() {
  const sb = createClient()
  const qc = useQueryClient()
  return useMutation({
    scope: { id: 'state-write' },
    mutationFn: async (_updater: StateUpdater) => {
      // onMutate (which runs first) has ALREADY applied this mutation's updater
      // to the cache, and `scope` guarantees mutations never interleave — so the
      // cached state IS the document to persist. Do NOT re-apply the updater
      // here: that would double-apply non-idempotent ops (the include-checkbox
      // toggles) and persist the wrong value.
      const trip = qc.getQueryData<Trip>(tk.activeTrip)
      if (!trip) throw new Error('No active trip')
      const next = trip.state
      // trip.state_rev is undefined on a pre-migration-06 DB → legacy direct write.
      const newRev = await writeState(sb, trip.id, next, trip.state_rev)
      // Sync the cached rev immediately: the next queued write (scope-serialized)
      // reads it from cache before the onSettled refetch has landed.
      if (newRev !== undefined) {
        qc.setQueryData<Trip>(tk.activeTrip, (t) => (t ? { ...t, state_rev: newRev } : t))
      }
      return next
    },
    onMutate: async (updater: StateUpdater) => {
      await qc.cancelQueries({ queryKey: tk.activeTrip })
      const prev = qc.getQueryData<Trip>(tk.activeTrip)
      if (prev) qc.setQueryData<Trip>(tk.activeTrip, { ...prev, state: updater(prev.state) })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      // Roll back the optimistic update (incl. after a rev conflict); onSettled's
      // invalidate then refetches the authoritative document + fresh rev.
      if (ctx?.prev) qc.setQueryData(tk.activeTrip, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tk.activeTrip }),
  })
}
