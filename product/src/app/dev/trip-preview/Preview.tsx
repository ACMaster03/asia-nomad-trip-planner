'use client'
import { TripScopeProvider } from '@/lib/trips/TripScope'
import { MoneyProvider } from '@/lib/trips/Money'
import { ConfirmProvider } from '@/components/Confirm'
import { Timeline } from '@/components/trips/Timeline'
import { AppNav } from '@/components/AppNav'
import { PullToRefresh } from '@/components/PullToRefresh'

// The (app) layout's providers, minus auth — see money-preview/Preview.tsx
// for why ConfirmProvider must be here (useConfirm fails closed).
export default function Preview() {
  return (
    <TripScopeProvider initialTripId="fixture" initialRole="owner">
      <MoneyProvider initialBase="HUF">
        <ConfirmProvider>
          <div className="pb-20">
            <Timeline />
          </div>
          <PullToRefresh />
          <AppNav showCheckIn pathname="/itinerary" />
        </ConfirmProvider>
      </MoneyProvider>
    </TripScopeProvider>
  )
}
