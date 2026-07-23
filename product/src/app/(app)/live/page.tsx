import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import LiveClient from './LiveClient'

// The event feed itself is fetched client-side (it's clock-dependent and
// changes constantly); the server prefetch covers the trip document + cities,
// same as every other trip screen.
export default async function LivePage() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <LiveClient />
    </HydrationBoundary>
  )
}
