'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { tk } from './keys'
import { trackingOf, type Tracking } from './tracking'
import { shouldRetryWrite, writeRetryDelay } from './writeRetry'

// Read and save Money's once-per-account answer (lib/trips/tracking.ts).
//
// The read is one small row, cached and persisted like every other query, so
// Money waits for it only on a device's first visit. A read that fails throws:
// the page then treats the answer as unknown and shows the full page, and a
// good answer cached earlier is not overwritten by the failure.
export function useTrackSpending() {
  const sb = createClient()
  return useQuery({
    queryKey: tk.trackSpending,
    queryFn: async (): Promise<Tracking> => {
      const { data: auth } = await sb.auth.getUser()
      if (!auth.user) return 'unknown'
      const { data, error } = await sb.from('profiles').select('track_spending').eq('id', auth.user.id).maybeSingle()
      if (error) throw error
      return trackingOf((data as { track_spending?: boolean | null } | null)?.track_spending)
    },
    retry: 1,
  })
}

// Save an answer. Optimistic, because the page changes shape on it: "Yes"
// opens the full page at once, "Not now" keeps the quiet one. A failed save
// puts the previous answer back, and the page's save banner says so.
export function useSetTrackSpending() {
  const sb = createClient()
  const qc = useQueryClient()
  return useMutation({
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    mutationFn: async (track: boolean) => {
      const { data: auth } = await sb.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Not signed in')
      const { error } = await sb.from('profiles').update({ track_spending: track }).eq('id', uid)
      if (error) throw error
    },
    onMutate: async (track) => {
      await qc.cancelQueries({ queryKey: tk.trackSpending })
      const prev = qc.getQueryData<Tracking>(tk.trackSpending)
      qc.setQueryData<Tracking>(tk.trackSpending, track ? 'yes' : 'no')
      return { prev }
    },
    onError: (_err, _track, ctx) => {
      if (ctx?.prev) qc.setQueryData<Tracking>(tk.trackSpending, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tk.trackSpending }),
  })
}
