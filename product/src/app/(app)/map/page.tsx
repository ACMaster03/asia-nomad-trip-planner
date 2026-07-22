import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { fetchCities, fetchCountries } from '@/lib/catalogue/queries'
import { getActiveTrip } from '@/lib/trips/prefetch'
import { qk } from '@/lib/catalogue/keys'
import { tk } from '@/lib/trips/keys'
import MapClient from './MapClient'

export default async function MapPage() {
  const sb = await createClient()
  const qc = new QueryClient()
  const [trip] = await Promise.all([
    getActiveTrip(), // memoized — same resolution the layout already did
    qc.prefetchQuery({ queryKey: qk.cities, queryFn: () => fetchCities(sb) }),
    qc.prefetchQuery({ queryKey: qk.countries, queryFn: () => fetchCountries(sb) }),
  ])
  if (trip) qc.setQueryData(tk.trip(trip.id), trip)
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MapClient />
    </HydrationBoundary>
  )
}
