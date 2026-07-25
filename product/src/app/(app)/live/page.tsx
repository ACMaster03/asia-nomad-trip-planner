import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { prefetchTripScreen, getActiveTrip } from '@/lib/trips/prefetch'
import { fetchTripRole, canEditRole } from '@/lib/trips/role'
import { NoAccess } from '@/components/trips/NoAccess'
import LiveClient from './LiveClient'

// The event feed itself is fetched client-side (it's clock-dependent and
// changes constantly); the server prefetch covers the trip document + cities,
// same as every other trip screen.
export default async function LivePage() {
  // VIEWER ON AN OWNER URL. The nav already hides /live from viewers, but a
  // pasted link bypasses the nav — and every action on this screen is a write,
  // so a viewer would meet nothing but failures. Refuse it here, on the server,
  // and say why. (The database refuses the writes regardless; this is about not
  // showing someone a screen made entirely of buttons they cannot press.)
  //
  // Resolved from the verified claims rather than a getUser() round trip:
  // /live is the screen most likely to be opened on bad hotel wifi.
  const sb = await createClient()
  const [{ data: claims }, trip] = await Promise.all([sb.auth.getClaims(), getActiveTrip()])
  if (trip) {
    const role = await fetchTripRole(sb, trip.id, claims?.claims?.sub as string | undefined).catch(
      () => null,
    )
    // null → the check itself failed (offline/flaky). Fall through to the screen
    // rather than locking the traveller out of check-ins over a network blip.
    if (role !== null && !canEditRole(role)) return <NoAccess />
  }

  const qc = await prefetchTripScreen()
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <LiveClient />
    </HydrationBoundary>
  )
}
