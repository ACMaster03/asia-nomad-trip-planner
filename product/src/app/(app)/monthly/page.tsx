import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import MonthlyClient from './MonthlyClient'

export default async function MonthlyPage() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MonthlyClient />
    </HydrationBoundary>
  )
}
