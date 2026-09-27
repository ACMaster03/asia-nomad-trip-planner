import { redirect } from 'next/navigation'
import { dehydrate } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import { Timeline } from '@/components/trips/Timeline'

// Trip is ONE timeline (mock 15 §1, #58): no Stops / Stays / Transport /
// Extras tabs. ?tab=extras kept the Extras list reachable from Money's
// One-offs card; both went with #39 (Patrik, 26 Sep), so an old link to it
// lands on Money, where a visa or a backpack is now an entry like any other.
export default async function ItineraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  if ((await searchParams).tab === 'extras') redirect('/money')
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <Timeline />
    </HydrationBoundary>
  )
}
