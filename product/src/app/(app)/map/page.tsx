import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { fetchCities, fetchCountries } from '@/lib/catalogue/queries'
import { fetchActiveTrip } from '@/lib/trips/queries'
import { qk } from '@/lib/catalogue/keys'
import { tk } from '@/lib/trips/keys'
import MapClient from './MapClient'

export default async function MapPage() {
  const sb = await createClient()
  const qc = new QueryClient()
  await Promise.all([
    qc.prefetchQuery({ queryKey: qk.cities, queryFn: () => fetchCities(sb) }),
    qc.prefetchQuery({ queryKey: qk.countries, queryFn: () => fetchCountries(sb) }),
    qc.prefetchQuery({ queryKey: tk.activeTrip, queryFn: () => fetchActiveTrip(sb) }),
  ])
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MapClient />
    </HydrationBoundary>
  )
}
