import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchTrip } from './queries'
import { tk } from './keys'

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
    queryFn: () => (tripId ? fetchTrip(sb, tripId) : Promise.resolve(null)),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  } as const
}
