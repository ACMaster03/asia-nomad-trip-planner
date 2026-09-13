'use client'
import { TripScopeProvider } from '@/lib/trips/TripScope'
import { MoneyProvider } from '@/lib/trips/Money'
import MoneyPage from '@/components/money/MoneyPage'
import DashboardClient from '@/app/(app)/dashboard/DashboardClient'

// The (app) layout's providers, minus auth. The query client is the root
// Providers' one (see page.tsx), so the fixture trip is read from the same
// persisted cache the real screens use.
export default function Preview({ screen }: { screen: 'money' | 'home' }) {
  return (
    <TripScopeProvider initialTripId="fixture" initialRole="owner">
      <MoneyProvider initialBase="HUF">
        <div className="pb-20">
          {screen === 'home' ? <DashboardClient userEmail="dev@example.com" userName="Dev" /> : <MoneyPage />}
        </div>
      </MoneyProvider>
    </TripScopeProvider>
  )
}
