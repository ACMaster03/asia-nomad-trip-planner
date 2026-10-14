'use client'
import { TripScopeProvider } from '@/lib/trips/TripScope'
import { MoneyProvider } from '@/lib/trips/Money'
import { ConfirmProvider } from '@/components/Confirm'
import { Timeline } from '@/components/trips/Timeline'
import { StopPage } from '@/components/trips/StopPage'
import { AppNav } from '@/components/AppNav'

// The (app) layout's providers, minus auth — see money-preview/Preview.tsx
// for why ConfirmProvider must be here (useConfirm fails closed).
export default function Preview({ stop }: { stop?: string }) {
  return (
    <TripScopeProvider initialTripId="fixture" initialRole="owner">
      <MoneyProvider initialBase="HUF">
        <ConfirmProvider>
          <div className="pb-20">
            {stop ? <StopPage id={stop} /> : <Timeline />}
          </div>
          <AppNav showCheckIn pathname="/itinerary" />
        </ConfirmProvider>
      </MoneyProvider>
    </TripScopeProvider>
  )
}
