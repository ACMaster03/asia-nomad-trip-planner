import { cache } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveTrip } from './queries'
import { fetchCities } from '@/lib/catalogue/queries'
import { tk } from './keys'
import { qk } from '@/lib/catalogue/keys'

// Per-request memoized resolution of the working trip (profile selection →
// newest visible; see resolveActiveTrip). React cache() dedupes the calls the
// (app) layout AND the page prefetch make within one server render.
export const getActiveTrip = cache(async () => {
  const sb = await createClient()
  return resolveActiveTrip(sb)
})

// Shared by all five trip screens: resolve + seed the active trip document and
// prefetch the shared catalogue cities (needed for cost estimates) on the
// server, then hydrate. The client reads the trip id from TripScopeProvider,
// which the (app) layout initializes from the same memoized resolution.
export async function prefetchTripScreen() {
  const sb = await createClient()
  const qc = new QueryClient()
  const [trip] = await Promise.all([
    getActiveTrip(),
    qc.prefetchQuery({ queryKey: qk.cities, queryFn: () => fetchCities(sb) }),
  ])
  if (trip) qc.setQueryData(tk.trip(trip.id), trip)
  return qc
}
