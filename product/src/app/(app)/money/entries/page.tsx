import { dehydrate } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { prefetchTripScreen } from '@/lib/trips/prefetch'
import type { EntriesParams } from '@/lib/trips/ledgerFilters'
import LedgerPage from '@/components/money/LedgerPage'

// The links from Money say what to open on (lib/trips/ledgerFilters.ts):
// ?day=YYYY-MM-DD scrolls to that day (the chart's "Open in All entries");
// ?before=1 what was bought before departure; ?from&to a stop's days; ?filter=
// one of the chips; ?cat= a category; ?fam= a family of Where it goes;
// ?coming=1 opens Coming up.
const KEYS = ['day', 'before', 'from', 'to', 'filter', 'cat', 'fam', 'coming'] as const

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [qc, raw] = await Promise.all([prefetchTripScreen(), searchParams])
  const params: EntriesParams = {}
  for (const k of KEYS) if (typeof raw[k] === 'string') params[k] = raw[k]
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <LedgerPage params={params} />
    </HydrationBoundary>
  )
}
