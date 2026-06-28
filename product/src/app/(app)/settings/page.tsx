import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <SettingsClient />
    </HydrationBoundary>
  )
}
