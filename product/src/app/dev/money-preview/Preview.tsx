'use client'
import { TripScopeProvider } from '@/lib/trips/TripScope'
import { MoneyProvider } from '@/lib/trips/Money'
import { ConfirmProvider } from '@/components/Confirm'
import MoneyPage from '@/components/money/MoneyPage'
import DashboardClient from '@/app/(app)/dashboard/DashboardClient'

// The (app) layout's providers, minus auth. The query client is the root
// Providers' one (see page.tsx), so the fixture trip is read from the same
// persisted cache the real screens use.
//
// ConfirmProvider belongs here for a reason worth keeping: useConfirm FAILS
// CLOSED, so without it every destructive action in this preview silently
// declined and looked like a dead button. A harness that cannot test a delete
// is not the harness for the screen with the deletes on it.
export default function Preview({ screen }: { screen: 'money' | 'home' }) {
  return (
    <TripScopeProvider initialTripId="fixture" initialRole="owner">
      <MoneyProvider initialBase="HUF">
        <ConfirmProvider>
          <div className="pb-20">
            {screen === 'home' ? <DashboardClient userEmail="dev@example.com" userName="Dev" /> : <MoneyPage />}
          </div>
        </ConfirmProvider>
      </MoneyProvider>
    </TripScopeProvider>
  )
}
