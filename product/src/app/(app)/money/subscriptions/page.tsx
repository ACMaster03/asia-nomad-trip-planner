import { dehydrate } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import SubscriptionsPage from '@/components/money/SubscriptionsPage'

// Every subscription, from Money's card (round 4b).
export default async function Page() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <SubscriptionsPage />
    </HydrationBoundary>
  )
}
