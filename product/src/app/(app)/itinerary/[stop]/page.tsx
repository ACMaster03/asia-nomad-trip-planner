import { dehydrate } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import { StopPage } from '@/components/trips/StopPage'

// A stop's own page (round 3c, decision 4): /itinerary/<stop id>, opened by
// tapping its card on the timeline. The same trip document as Trip, prefetched
// the same way, so the page is there on the first paint.
export default async function StopRoute({ params }: { params: Promise<{ stop: string }> }) {
  const { stop } = await params
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <StopPage id={stop} />
    </HydrationBoundary>
  )
}
