import { Suspense } from 'react'
import { dehydrate } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import ItineraryHub from './ItineraryHub'

export default async function ItineraryPage() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      {/* useSearchParams (?tab=) wants a Suspense boundary above it */}
      <Suspense fallback={null}>
        <ItineraryHub />
      </Suspense>
    </HydrationBoundary>
  )
}
