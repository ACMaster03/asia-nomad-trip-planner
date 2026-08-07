import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const qc = await prefetchTripScreen()
  // Home owns the Account entry (avatar, top-right — handoff nav "1g"); the
  // layout already verified auth, this just reads the email for the initial.
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const meta = data?.claims?.user_metadata as { first_name?: string } | undefined
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <DashboardClient
        userEmail={data?.claims?.email as string | undefined}
        userName={meta?.first_name}
      />
    </HydrationBoundary>
  )
}
