import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getActiveTrip } from '@/lib/trips/prefetch'
import { TripScopeProvider } from '@/lib/trips/TripScope'

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

  // Nav canon (design/mocks/FIXTURES.md): "Live" is a nav item during the live
  // phase ONLY — startDate <= today <= endDate (open-ended trips stay live).
  // Uses the server's UTC calendar date; the layout is already dynamic
  // (cookie-based auth), so this re-evaluates on every request.
  const meta = activeTrip?.state?.meta
  const today = new Date().toISOString().slice(0, 10)
  const showLive =
    !!meta?.startDate && meta.startDate <= today && (!meta.endDate || today <= meta.endDate)

  return (
    <TripScopeProvider initialTripId={activeTrip?.id ?? null}>
      <div className="min-h-screen">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
          <Link href="/dashboard" className="font-semibold">🧭 Asia Nomad Planner</Link>
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          {showLive && <Link href="/live" className="hover:underline">Live</Link>}
          <Link href="/itinerary" className="hover:underline">Itinerary</Link>
          <Link href="/money" className="hover:underline">Money</Link>
          <Link href="/map" className="hover:underline">Map</Link>
          <Link href="/knowledge" className="hover:underline">Explore</Link>
          <Link href="/settings" className="ml-auto hover:underline">Settings</Link>
        </nav>
        {children}
      </div>
    </TripScopeProvider>
  )
}
