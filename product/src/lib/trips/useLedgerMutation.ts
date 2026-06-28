'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { writeLedger } from './queries'
import { tk } from './keys'
import type { Ledger, Trip } from './types'

export function useLedgerMutation(tripId: string) {
  const sb = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (next: Ledger) => writeLedger(sb, tripId, next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: tk.activeTrip })
      const prev = qc.getQueryData<Trip>(tk.activeTrip)
      if (prev) qc.setQueryData<Trip>(tk.activeTrip, { ...prev, ledger: next })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(tk.activeTrip, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tk.activeTrip }),
  })
}
