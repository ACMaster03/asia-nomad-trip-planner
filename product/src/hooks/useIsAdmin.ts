'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// UI-gating only — RLS is the real security boundary. Tells the client whether to
// show inline admin affordances (edit/add). A non-admin who forges this still
// can't write, because the catalogue write policies require is_admin() server-side.
export function useIsAdmin() {
  const sb = createClient()
  return useQuery({
    queryKey: ['is-admin'],
    queryFn: async () => {
      const { data: auth } = await sb.auth.getUser()
      if (!auth.user) return false
      const { data } = await sb
        .from('profiles')
        .select('is_admin')
        .eq('id', auth.user.id)
        .maybeSingle()
      return Boolean(data?.is_admin)
    },
    staleTime: 5 * 60_000,
  })
}
