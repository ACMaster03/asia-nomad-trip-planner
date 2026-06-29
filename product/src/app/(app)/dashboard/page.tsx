import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <DashboardClient />
    </HydrationBoundary>
  )
}
