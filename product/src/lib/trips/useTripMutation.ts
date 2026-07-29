'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { writeState, isPermissionDenied } from './queries'
import { tk } from './keys'
import { useTripScope } from './TripScope'
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
  const { tripId } = useTripScope()
  const key = tk.trip(tripId ?? 'none')
  return useMutation({
    scope: { id: 'state-write' },
    // the param is unused (see comment below) but its type drives useMutation's
    // TVariables inference — mutate(updater) stops compiling without it.
    mutationFn: async (_updater: StateUpdater) => {
      // onMutate (which runs first) has ALREADY applied this mutation's updater
      // to the cache, and `scope` guarantees mutations never interleave — so the
      // cached state IS the document to persist. Do NOT re-apply the updater
      // here: that would double-apply non-idempotent ops (the include-checkbox
      // toggles) and persist the wrong value.
      const trip = qc.getQueryData<Trip>(key)
      if (!trip) throw new Error('No active trip')
      const next = trip.state
      const newRev = await writeState(sb, trip.id, next, trip.state_rev)
      // Sync the cached rev immediately: the next queued write (scope-serialized)
      // reads it from cache before the onSettled refetch has landed.
      qc.setQueryData<Trip>(key, (t) => (t ? { ...t, state_rev: newRev } : t))
      return next
    },
    onMutate: async (updater: StateUpdater) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Trip>(key)
      if (prev) qc.setQueryData<Trip>(key, { ...prev, state: updater(prev.state) })
      return { prev }
    },
    onError: (e, _v, ctx) => {
      // Roll back the optimistic update (incl. after a rev conflict); onSettled's
      // invalidate then refetches the authoritative document + fresh rev.
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      // Access was revoked or downgraded while this tab was open: re-resolve the
      // role so the screen switches to read-only instead of offering buttons
      // that will keep failing.
      if (isPermissionDenied(e)) qc.invalidateQueries({ queryKey: tk.role(tripId ?? 'none') })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
