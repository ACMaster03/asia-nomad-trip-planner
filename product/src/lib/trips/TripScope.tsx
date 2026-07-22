'use client'
import { createContext, useContext, useState } from 'react'

// Scopes every trip screen to one trip id. The server layout resolves the id
// (profiles.active_trip_id → newest visible; see resolveActiveTrip) and mounts
// this provider; the Settings switcher updates it after persisting the new
// selection to the profile. null → the user has no trips yet (create state).
type TripScopeValue = {
  tripId: string | null
  setTripId: (id: string | null) => void
}

const TripScopeContext = createContext<TripScopeValue | null>(null)

export function TripScopeProvider({ initialTripId, children }: { initialTripId: string | null; children: React.ReactNode }) {
  const [tripId, setTripId] = useState<string | null>(initialTripId)
  return <TripScopeContext.Provider value={{ tripId, setTripId }}>{children}</TripScopeContext.Provider>
}

export function useTripScope(): TripScopeValue {
  const ctx = useContext(TripScopeContext)
  if (!ctx) throw new Error('useTripScope must be used inside TripScopeProvider — is the (app) layout mounted?')
  return ctx
}
