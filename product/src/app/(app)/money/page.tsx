import { dehydrate } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
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
