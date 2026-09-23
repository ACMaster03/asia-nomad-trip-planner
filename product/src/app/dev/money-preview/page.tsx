import { notFound } from 'next/navigation'
import { dehydrate, QueryClient } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { tk } from '@/lib/trips/keys'
import { fixtureTrip } from './fixture'
import Preview from './Preview'

// DEV ONLY: renders the Money page from a fixture trip, no sign-in needed.
// Sign-in is magic-link only, so there is no other way to eyeball a screen
// with realistic data from a fresh browser. 404s outside development.
//
// Wired the way the real trip screens are — server-seeded trip document,
// dehydrated into the boundary, restored client-side through the root
// Providers (IndexedDB persister included), behind the same loading.tsx
// Suspense boundary — so it also reproduces the persisted-cache-versus-server
// hydration race that lib/query/hydration.ts exists for. Recipe: load once,
// edit the persisted copy in IndexedDB (key anp-query-cache) to something
// older, reload with ?slow=3000 and watch the console. ?screen=home renders
// Home instead: Money paints "Loading…" until it knows today's date, Home
// server-renders the trip document, so Home is where a mismatch shows.
// ?screen=extras renders the Extras list (and its form) from the same fixture.
// ?track=ask | no | yes seeds Money's once-per-account answer (migration 41):
// ask shows the question (over the full page, since the fixture has logged
// costs), no the quiet page, yes (the default) the full page, with its Track
// spending switch by the budget cap. ?logged=0 drops the costs typed on Money
// from the fixture, for a newcomer: the question then sits over the quiet page.
export default async function MoneyPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ slow?: string; screen?: string; track?: string; logged?: string }>
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  // ?slow=<ms> streams the page that long after the shell, the way the real
  // screens do while they wait on Supabase. Without the gap the page hydrates
  // before the IndexedDB restore lands and the race never happens on
  // localhost; with dev-sized bundles it takes a few seconds to open up.
  const params = await searchParams
  const slow = Number(params.slow)
  if (slow > 0) await new Promise((r) => setTimeout(r, Math.min(slow, 10_000)))
  const qc = new QueryClient()
  const fixture = fixtureTrip(new Date().toISOString().slice(0, 10))
  if (params.logged === '0') fixture.ledger = fixture.ledger.filter((e) => e.source)
  qc.setQueryData(tk.trip('fixture'), fixture)
  qc.setQueryData(tk.trackSpending, params.track === 'ask' ? 'ask' : params.track === 'no' ? 'no' : 'yes')
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <Preview
        screen={params.screen === 'home' ? 'home' : params.screen === 'extras' ? 'extras' : 'money'}
      />
    </HydrationBoundary>
  )
}
