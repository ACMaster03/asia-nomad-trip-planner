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
  // tripId null → no trips exist → the query is disabled and trip.data stays
  // undefined; screens render the create/empty state exactly as before.
  const trip = useQuery({
    queryKey: tk.trip(tripId ?? 'none'),
    queryFn: () => fetchTrip(sb, tripId!),
    enabled: tripId !== null,
  })
  const cities = useQuery({ queryKey: qk.cities, queryFn: () => fetchCities(sb) })
  const cityIdx = useMemo(() => buildCityIndex(cities.data ?? []), [cities.data])
  return { trip, cities, cityIdx }
}
