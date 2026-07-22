'use client'
import { OnboardingWizard } from './OnboardingWizard'

// Zero-trips state: the onboarding wizard IS the empty state (mock 01 note:
// "Wizard fires only when a fresh account has zero trips"). Once step 1
// creates the trip, TripScope switches to it and the app screens take over.
export default function CreateTripEmptyState() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <OnboardingWizard />
    </main>
  )
}
