import { dehydrate } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import RatesClient from './RatesClient'

// Exchange rates, from Trip settings (round 5, the phone's RatesScreen).
export default async function RatesPage() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <RatesClient />
    </HydrationBoundary>
  )
}
