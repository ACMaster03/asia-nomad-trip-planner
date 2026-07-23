import { cache } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveTrip } from './queries'
import { tk } from './keys'

// Per-request memoized resolution of the working trip (profile selection →
// newest visible; see resolveActiveTrip). React cache() dedupes the calls the
// (app) layout AND the page prefetch make within one server render.
export const getActiveTrip = cache(async () => {
  const sb = await createClient()
  return resolveActiveTrip(sb)
})

// Shared by all five trip screens: resolve + seed the active trip document on
// the server, then hydrate. The client reads the trip id from
// TripScopeProvider, which the (app) layout initializes from the same
// memoized resolution.
//
// The cities catalogue is deliberately NOT prefetched here: it is ~100 kB of
// jsonb that would ride along on EVERY navigation's flight payload. The client
// fetches it once (useTripScreen, long staleTime) and the IndexedDB-persisted
// cache keeps it across sessions.
export async function prefetchTripScreen() {
  const qc = new QueryClient()
  const trip = await getActiveTrip()
  if (trip) qc.setQueryData(tk.trip(trip.id), trip)
  return qc
}
