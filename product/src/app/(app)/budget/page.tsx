import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import BudgetClient from './BudgetClient'

export default async function BudgetPage() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <BudgetClient />
    </HydrationBoundary>
  )
}
