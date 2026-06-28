import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { fetchFields, fetchCities, fetchCountries } from '@/lib/catalogue/queries'
import { qk } from '@/lib/catalogue/keys'
import KnowledgeClient from './KnowledgeClient'

export default async function KnowledgePage() {
  const sb = await createClient()
  const qc = new QueryClient()
  await Promise.all([
    qc.prefetchQuery({ queryKey: qk.fields, queryFn: () => fetchFields(sb) }),
    qc.prefetchQuery({ queryKey: qk.cities, queryFn: () => fetchCities(sb) }),
    qc.prefetchQuery({ queryKey: qk.countries, queryFn: () => fetchCountries(sb) }),
  ])
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <KnowledgeClient />
    </HydrationBoundary>
  )
}
