import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import MoneyClient from './MoneyClient'

export default async function MoneyPage() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MoneyClient />
    </HydrationBoundary>
  )
}
