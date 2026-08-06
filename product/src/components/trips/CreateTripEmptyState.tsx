'use client'
import { DoorClosed } from 'lucide-react'
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

  // Frame 36 — access revoked while this tab was open.
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <div className="lv-enter rounded-[calc(var(--r)+2px)] bg-sf px-6 py-7 text-center text-tx">
        <DoorClosed aria-hidden className="mx-auto size-9 text-tx2" strokeWidth={2} />
        <h1 className="mt-3 text-[22px] font-semibold leading-tight">You no longer have access to this trip</h1>
        <p className="mt-2.5 text-base leading-relaxed text-tx2">
          It may have been deleted, or your invite was withdrawn. Ask the owner if you think
          this is a mistake.
        </p>
        <a
          href="/account"
          className="mt-5 inline-block rounded-[calc(var(--r)-2px)] bg-ac px-[22px] py-[13px] text-base font-semibold text-on"
        >
          Pick another trip or start your own
        </a>
      </div>
    </main>
  )
}
