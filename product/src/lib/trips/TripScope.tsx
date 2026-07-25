'use client'
import { createContext, useContext, useState } from 'react'
import type { TripRole } from './role'

// Scopes every trip screen to one trip id. The server layout resolves the id
// (profiles.active_trip_id → newest visible; see resolveActiveTrip) and mounts
// this provider; the Settings switcher updates it after persisting the new
// selection to the profile. null → the user has no trips yet (create state).
//
// The layout also resolves the caller's ROLE on that trip and seeds it here, so
// the first paint already knows whether to draw edit affordances. Without the
// seed, every screen would flash its edit buttons before the role query landed
// — or, if we defaulted the other way, would flash read-only at the owner.
// `initialRole` is only valid for `initialTripId`; useTripRole checks that
// before using it as seed data (switching trips re-resolves).
type TripScopeValue = {
  tripId: string | null
  setTripId: (id: string | null) => void
  initialTripId: string | null
  initialRole: TripRole | null
}

const TripScopeContext = createContext<TripScopeValue | null>(null)

export function TripScopeProvider({
  initialTripId,
  initialRole = null,
  children,
}: {
  initialTripId: string | null
  initialRole?: TripRole | null
  children: React.ReactNode
}) {
  const [tripId, setTripId] = useState<string | null>(initialTripId)
  return (
    <TripScopeContext.Provider value={{ tripId, setTripId, initialTripId, initialRole }}>
      {children}
    </TripScopeContext.Provider>
  )
}

export function useTripScope(): TripScopeValue {
  const ctx = useContext(TripScopeContext)
  if (!ctx) throw new Error('useTripScope must be used inside TripScopeProvider — is the (app) layout mounted?')
  return ctx
}
