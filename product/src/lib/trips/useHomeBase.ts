'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { tk } from './keys'
import { shouldRetryWrite, writeRetryDelay } from './writeRetry'

// Where the signed-in person lives (#58; Patrik, 27 Sep; migration 43): the
// first and last node of every journey, on the profile rather than on any one
// trip. Screens pass it through homeFor (timeline.ts), which falls back to the
// journey's own home, so a read that fails, or a person who never set one,
// still sees the home the journey was created with.
export function useHomeBase() {
  const sb = createClient()
  return useQuery({
    queryKey: tk.homeBase,
    queryFn: async (): Promise<string | null> => {
      const { data: auth } = await sb.auth.getUser()
      if (!auth.user) return null
      const { data, error } = await sb.from('profiles').select('home_base').eq('id', auth.user.id).maybeSingle()
      if (error) throw error
      return (data as { home_base?: string | null } | null)?.home_base?.trim() || null
    },
    retry: 1,
  })
}

// Set it, or clear it with ''. Optimistic, so Trip's first and last node move
// at once; a failed save puts the previous home back and says so.
export function useSetHomeBase() {
  const sb = createClient()
  const qc = useQueryClient()
  return useMutation({
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    mutationFn: async (home: string) => {
      const { data: auth } = await sb.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Not signed in')
      const { error } = await sb.from('profiles').update({ home_base: home.trim() || null }).eq('id', uid)
      if (error) throw error
    },
    onMutate: async (home) => {
      await qc.cancelQueries({ queryKey: tk.homeBase })
      const prev = qc.getQueryData<string | null>(tk.homeBase)
      qc.setQueryData<string | null>(tk.homeBase, home.trim() || null)
      return { prev }
    },
    onError: (_err, _home, ctx) => {
      if (ctx) qc.setQueryData<string | null>(tk.homeBase, ctx.prev ?? null)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tk.homeBase }),
  })
}
