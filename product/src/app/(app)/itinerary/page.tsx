import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { dehydrate } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import ItineraryHub from './ItineraryHub'

export default async function ItineraryPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  // The Extras screen (?tab=extras) is gone since round 3c: one-offs are added
  // and changed on Money's own card, so an old link or bookmark lands there.
  if ((await searchParams).tab === 'extras') redirect('/money')
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
