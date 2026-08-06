import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import RemindersClient from './RemindersClient'

export default async function RemindersPage() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <RemindersClient />
    </HydrationBoundary>
  )
}
