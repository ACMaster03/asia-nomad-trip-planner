'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { writeLedger } from './queries'
import { tk } from './keys'
import type { Ledger, Trip } from './types'

type Updater = (cur: Ledger) => Ledger

// Takes an UPDATER (not a prebuilt array) so each add/delete composes against the
// freshest ledger in cache — concurrent ops can't clobber each other. `scope`
// serializes the network writes so they apply one at a time; onSettled reconciles
// with the DB truth. trip id is read from cache (no render-captured id).
export function useLedgerMutation() {
  const sb = createClient()
  const qc = useQueryClient()
  return useMutation({
    scope: { id: 'ledger-write' },
    mutationFn: async (updater: Updater) => {
      const trip = qc.getQueryData<Trip>(tk.activeTrip)
      if (!trip) throw new Error('No active trip')
      const next = updater(trip.ledger)
      await writeLedger(sb, trip.id, next)
      return next
    },
    onMutate: async (updater: Updater) => {
      await qc.cancelQueries({ queryKey: tk.activeTrip })
      const prev = qc.getQueryData<Trip>(tk.activeTrip)
      if (prev) qc.setQueryData<Trip>(tk.activeTrip, { ...prev, ledger: updater(prev.ledger) })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(tk.activeTrip, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tk.activeTrip }),
  })
}
