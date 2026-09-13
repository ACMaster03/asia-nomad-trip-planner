import { hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query'

// Applies a page's server-dehydrated queries to the client cache IN RENDER,
// so the components below the boundary read them in the very same pass.
//
// WHY NOT TanStack's HydrationBoundary. Its render step only hydrates queries
// that are NOT in the cache yet; a query that already exists (with older data)
// is deferred to a useEffect, so the first client render shows whatever the
// cache held. That is fine for a client-side navigation, but on a document
// load our persisted IndexedDB cache (app/providers.tsx) is restored from an
// effect of the ROOT layout, while the page segment streams behind the (app)
// loading.tsx Suspense boundary and is hydrated on its own, later. The restore
// (a few ms of IndexedDB) wins that race whenever the page waits on Supabase
// for longer than that — i.e. always in production. When the persisted copy is
// older than what the server rendered (an edit from the other phone, a data
// migration), the first client render paints the STALE document:
//   - if React is mid-hydration of the segment, that is a text mismatch and
//     React logs #418 (seen on /money and /dashboard, 2026-09-13);
//   - if the isRestoring context flip has already committed, React gives up
//     hydrating the segment and client-renders it — no error, but the stale
//     document is painted for a frame before the effect swaps it (what the
//     dev-only /dev/money-preview?screen=home&slow=3000 recipe shows).
//
// The rule here:
//   - hydrating (React is hydrating server HTML — this state IS the HTML):
//     the dehydrated state always wins, whatever the cache holds, and it is
//     stamped "as of now" on the CLIENT clock. Persisted timestamps are client
//     clock, the server's are server clock; without the stamp a phone whose
//     clock runs ahead would let the persisted restore (query-core hydrate()
//     compares dataUpdatedAt) overwrite the fresher server copy a moment later.
//   - not hydrating (client-side navigation, or the client-rendered segment
//     above): TanStack's own rule — apply only if the server copy is newer —
//     but synchronously, so the screen never paints the stale document first.
//
// Mutating an existing query in render is safe: query-core notifies observers
// through notifyManager (setTimeout 0), so no component is updated mid-render.
// An observer that already rendered this pass (MoneyProvider in the layout)
// gets React's useSyncExternalStore post-commit consistency check instead.
//
// Idempotent: React re-renders the boundary once after hydration (the
// useSyncExternalStore server→client snapshot flip) and StrictMode double-
// invokes memos; a second pass finds nothing newer and does nothing.
export function applyDehydratedState(
  client: QueryClient,
  state: DehydratedState,
  { hydrating, now = Date.now() }: { hydrating: boolean; now?: number },
) {
  const cache = client.getQueryCache()
  const fresh: DehydratedState['queries'] = []
  for (const dq of state.queries ?? []) {
    const dqState =
      hydrating && dq.state.dataUpdatedAt < now ? { ...dq.state, dataUpdatedAt: now } : dq.state
    const existing = cache.get(dq.queryHash)
    if (!existing) {
      fresh.push({ ...dq, state: dqState })
      continue
    }
    if (!hydrating && dqState.dataUpdatedAt <= existing.state.dataUpdatedAt) continue
    // What query-core's hydrate() does for an existing query, minus its
    // timestamp gate: keep the live fetchStatus (a refetch in flight stays in
    // flight and lands on top), replace everything else.
    existing.setState({ ...dqState, fetchStatus: existing.state.fetchStatus })
  }
  // Pages dehydrate a per-request QueryClient, which never holds mutations;
  // the outbox's persisted mutations are restored by the persister, not here.
  if (fresh.length > 0) hydrate(client, { queries: fresh, mutations: [] })
}
