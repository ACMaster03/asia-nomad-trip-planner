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
export function useTripMutation() {
  const sb = createClient()
  const qc = useQueryClient()
  return useMutation({
    scope: { id: 'state-write' },
    mutationFn: async (updater: StateUpdater) => {
      const trip = qc.getQueryData<Trip>(tk.activeTrip)
      if (!trip) throw new Error('No active trip')
      const next = updater(trip.state)
      await writeState(sb, trip.id, next)
      return next
    },
    onMutate: async (updater: StateUpdater) => {
      await qc.cancelQueries({ queryKey: tk.activeTrip })
      const prev = qc.getQueryData<Trip>(tk.activeTrip)
      if (prev) qc.setQueryData<Trip>(tk.activeTrip, { ...prev, state: updater(prev.state) })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(tk.activeTrip, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tk.activeTrip }),
  })
}
