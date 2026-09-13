import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import MoneyPage from '@/components/money/MoneyPage'

export default async function Page() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MoneyPage />
    </HydrationBoundary>
  )
}
