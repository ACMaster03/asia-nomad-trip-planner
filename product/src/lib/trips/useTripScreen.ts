'use client'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchActiveTrip } from './queries'
import { fetchCities } from '@/lib/catalogue/queries'
import { tk } from './keys'
import { qk } from '@/lib/catalogue/keys'
import { buildCityIndex } from './budget'

export function useTripScreen() {
  const sb = createClient()
  const trip = useQuery({ queryKey: tk.activeTrip, queryFn: () => fetchActiveTrip(sb) })
  const cities = useQuery({ queryKey: qk.cities, queryFn: () => fetchCities(sb) })
  const cityIdx = useMemo(() => buildCityIndex(cities.data ?? []), [cities.data])
  return { trip, cities, cityIdx }
}
