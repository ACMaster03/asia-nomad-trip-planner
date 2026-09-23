import { dehydrate } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import LedgerPage from '@/components/money/LedgerPage'

// ?day=YYYY-MM-DD opens the list at that day: the Daily spend chart's
// "Show all in the ledger" links here.
export default async function Page({ searchParams }: { searchParams: Promise<{ day?: string | string[] }> }) {
  const [qc, { day }] = await Promise.all([prefetchTripScreen(), searchParams])
  const d = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <LedgerPage day={d} />
    </HydrationBoundary>
  )
}
