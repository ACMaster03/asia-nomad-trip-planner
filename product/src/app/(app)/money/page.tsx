import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import MoneyHub from './MoneyHub'

export default async function MoneyPage() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MoneyHub />
    </HydrationBoundary>
  )
}
