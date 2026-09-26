import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import { fetchTrip } from './queries'
import { tk } from './keys'
import { LEDGER_SCOPE, STATE_SCOPE, withPendingWrites } from './pendingWrites'
import type { Trip } from './types'

// The trip document query, defined once so every consumer (useTripScreen,
// MoneyProvider) agrees on freshness.
//
// FRESH ON OPEN (owner note, 2026-09-11: "when opening the screen it should
// show fresh data, currently the app refreshes when we open"). The persisted
// cache paints instantly — that is the offline-first contract and stays — but
// the document is refetched the moment the app returns to the foreground and
// whenever it is older than a minute, instead of the global 5-minute /
// never-on-focus defaults that were letting the partner's edits sit unseen.
// Forms hold their own local state, so a focus refetch cannot clobber an edit
// in progress; in-flight writes cancel the refetch in onMutate.
export function tripQueryOptions(sb: SupabaseClient, tripId: string | null) {
  return {
    queryKey: tk.trip(tripId ?? 'none'),
    // Every reader of the trip document goes through here, so a refetch never
    // lands over writes still queued (pendingWrites.ts).
    queryFn: async ({ client }: { client: QueryClient }) => {
      if (!tripId) return null
      const fresh = await fetchTrip(sb, tripId)
      const pending = (scope: string) =>
        client.getMutationCache().findAll({ status: 'pending' }).some((m) => m.options.scope?.id === scope)
      return withPendingWrites(fresh, client.getQueryData<Trip>(tk.trip(tripId)), {
        state: pending(STATE_SCOPE),
        ledger: pending(LEDGER_SCOPE),
      })
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  } as const
}
