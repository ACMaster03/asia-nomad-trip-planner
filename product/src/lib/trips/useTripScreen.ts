'use client'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchTrip } from './queries'
import { fetchCities } from '@/lib/catalogue/queries'
import { tk } from './keys'
import { qk } from '@/lib/catalogue/keys'
import { buildCityIndex } from './budget'
import { useTripScope } from './TripScope'

export function useTripScreen() {
  const sb = createClient()
  const { tripId } = useTripScope()
  // tripId null → no trips exist. The query must still RESOLVE (to null) rather
  // than sit disabled — a disabled query stays isPending forever, which would
  // pin every screen on "Loading…" instead of the create/empty state.
  const trip = useQuery({
    queryKey: tk.trip(tripId ?? 'none'),
    queryFn: () => (tripId ? fetchTrip(sb, tripId) : Promise.resolve(null)),
  })
  // World data changes rarely and weighs ~100 kB — fetch client-side once and
  // let the persisted cache (IndexedDB, 24 h) carry it; the server deliberately
  // does not prefetch it (see prefetch.ts).
  const cities = useQuery({
    queryKey: qk.cities,
    queryFn: () => fetchCities(sb),
    staleTime: 6 * 60 * 60_000,
  })
  const cityIdx = useMemo(() => buildCityIndex(cities.data ?? []), [cities.data])
  return { trip, cities, cityIdx }
}
