import { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { fetchActiveTrip } from './queries'
import { fetchCities } from '@/lib/catalogue/queries'
import { tk } from './keys'
import { qk } from '@/lib/catalogue/keys'

// Shared by all five trip screens: prefetch the user's active trip + the shared
// catalogue cities (needed for cost estimates) on the server, then hydrate.
export async function prefetchTripScreen() {
  const sb = await createClient()
  const qc = new QueryClient()
  await Promise.all([
    qc.prefetchQuery({ queryKey: tk.activeTrip, queryFn: () => fetchActiveTrip(sb) }),
    qc.prefetchQuery({ queryKey: qk.cities, queryFn: () => fetchCities(sb) }),
  ])
  return qc
}
