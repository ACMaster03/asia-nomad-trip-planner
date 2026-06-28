import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import OverviewClient from './OverviewClient'

export default async function OverviewPage() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <OverviewClient />
    </HydrationBoundary>
  )
}
