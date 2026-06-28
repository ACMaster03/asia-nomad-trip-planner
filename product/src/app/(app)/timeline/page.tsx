import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import TimelineClient from './TimelineClient'

export default async function TimelinePage() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <TimelineClient />
    </HydrationBoundary>
  )
}
