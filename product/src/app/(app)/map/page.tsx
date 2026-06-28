import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { fetchCities } from '@/lib/catalogue/queries'
import { qk } from '@/lib/catalogue/keys'
import MapClient from './MapClient'

export default async function MapPage() {
  const sb = await createClient()
  const qc = new QueryClient()
  await qc.prefetchQuery({ queryKey: qk.cities, queryFn: () => fetchCities(sb) })
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MapClient />
    </HydrationBoundary>
  )
}
