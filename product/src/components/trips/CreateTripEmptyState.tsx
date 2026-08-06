'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchTrip } from '@/lib/trips/queries'
import { tk } from '@/lib/trips/keys'
import { useTripScope } from '@/lib/trips/TripScope'
import { OnboardingWizard } from './OnboardingWizard'

// Zero-trips state: the onboarding wizard IS the empty state (mock 01 note:
// "Wizard fires only when a fresh account has zero trips"). Once step 1
// creates the trip, TripScope switches to it and the app screens take over.
//
// Every trip screen funnels its `!trip.data` guard through here, and that
// condition covers THREE situations, only one of which is "fresh account":
//   tripId === null                → zero trips: show the wizard.
//   tripId set, query pending      → just loading: showing the wizard here
//                                    would flash "set up your trip" at a user
//                                    who has a trip. Hold the frame instead.
//   tripId set, query settled null → the scoped trip became unreadable: it was
//                                    deleted, or the caller's access was
//                                    revoked while this tab was open. Showing
//                                    the wizard would tell a just-revoked
//                                    viewer they have no trips at all. Say
//                                    what actually happened.
export default function CreateTripEmptyState() {
  const sb = createClient()
  const { tripId } = useTripScope()
  // Same key + fn as the screens above us, so this subscribes to the cached
  // document rather than firing a second request.
  const trip = useQuery({
    queryKey: tk.trip(tripId ?? 'none'),
    queryFn: () => fetchTrip(sb, tripId!),
    enabled: tripId !== null,
  })

  if (tripId === null) {
    // The wizard brings its own full-bleed 2b wash — no page padding here.
    return (
      <main>
        <OnboardingWizard />
      </main>
    )
  }

  if (trip.isPending) return null

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-6 text-center dark:border-neutral-700 dark:bg-neutral-900">
        <p aria-hidden className="mb-2 text-2xl">
          🚪
        </p>
        <h1 className="mb-1 text-lg font-semibold">You no longer have access to this trip</h1>
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          It may have been deleted, or your invite was withdrawn. Ask the owner if you think
          this is a mistake.
        </p>
        <a
          href="/settings"
          className="inline-block rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white"
        >
          Pick another trip or start your own
        </a>
      </div>
    </main>
  )
}
