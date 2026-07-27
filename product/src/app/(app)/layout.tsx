import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTrip } from '@/lib/trips/prefetch'
import { fetchTripRole, canEditRole } from '@/lib/trips/role'
import { TripScopeProvider } from '@/lib/trips/TripScope'
import { MoneyProvider } from '@/lib/trips/Money'
import { AppNav } from '@/components/AppNav'
import { OfflineWarmup } from '@/components/OfflineWarmup'
import { PendingInvites } from '@/components/trips/PendingInvites'

// Server-side auth guard. The shared catalogue RLS is `to authenticated`, so an
// unauthenticated visitor would get zero rows; require a session here instead.
// Never rely on the proxy alone — re-check auth in the protected layout.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) redirect('/login')

  // Resolve the working trip once per request (memoized — page prefetches reuse
  // it) and scope every screen to it via context. null → no trips yet →
  // screens render the create/empty state.
  const activeTrip = await getActiveTrip()

  // Resolve the caller's role here too, so the first paint already knows whether
  // to draw edit affordances (see TripScope). Uses the claims we just verified
  // instead of a second auth round trip. A failure resolves to null rather than
  // 500ing the whole app — the client hook re-resolves it.
  const initialRole = activeTrip
    ? await fetchTripRole(supabase, activeTrip.id, data.claims.sub as string).catch(() => null)
    : null

  // Nav canon (design/mocks/FIXTURES.md): "Live" is a nav item during the live
  // phase ONLY — startDate <= today <= endDate (open-ended trips stay live).
  // Uses the server's UTC calendar date; the layout is already dynamic
  // (cookie-based auth), so this re-evaluates on every request.
  //
  // Viewers never get it: /live exists to WRITE check-ins, and a read-only
  // check-in screen is just a worse version of the follow page.
  //
  // If the role didn't resolve (null) we SHOW it — the pre-viewer-role
  // behaviour. Losing the check-in screen to a flaky connection mid-trip is a
  // far worse failure than a viewer briefly seeing a tab whose every write the
  // database refuses anyway.
  const meta = activeTrip?.state?.meta
  const today = new Date().toISOString().slice(0, 10)
  const showLive =
    !!meta?.startDate &&
    meta.startDate <= today &&
    (!meta.endDate || today <= meta.endDate) &&
    (initialRole === null || canEditRole(initialRole))

  return (
    <TripScopeProvider initialTripId={activeTrip?.id ?? null} initialRole={initialRole}>
      {/* Seeded from the trip already resolved above, so the first paint is in
          the right currency instead of flashing a default. */}
      <MoneyProvider initialBase={meta?.baseCurrency ?? 'HUF'}>
        <OfflineWarmup />
        <div className="min-h-screen">
          <AppNav showLive={showLive} userEmail={data.claims.email as string | undefined} />
          {/* Above every screen: an invite is to a trip you cannot navigate to
              yet, so it has no page of its own to live on. Renders nothing
              unless you actually have one. */}
          <PendingInvites />
          {children}
        </div>
      </MoneyProvider>
    </TripScopeProvider>
  )
}
