'use client'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchTrip } from './queries'
import { fetchCityList, fetchCitiesByName } from '@/lib/catalogue/queries'
import { fetchFx, crossRate } from '@/lib/catalogue/fx'
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
  // TIER 2 (migration 20): the LIGHT city list — no attributes, ~8 kB instead
  // of ~102 kB. Enough for the stop picker and for matching a stop's city to
  // its places; nothing on these screens renders catalogue attributes.
  const cities = useQuery({
    queryKey: qk.citiesLite,
    queryFn: () => fetchCityList(sb),
    staleTime: 6 * 60 * 60_000,
  })

  // TIER 1: full rows, but ONLY for the cities on this route — the budget needs
  // their costs.accomPerNight / costs.dailyLiving. Scoped like this it stays
  // small and precacheable no matter how large the catalogue grows.
  const routeCities = useMemo(
    () => [...new Set((trip.data?.state.segments ?? []).map((s) => s.city).filter(Boolean))],
    [trip.data],
  )
  const tripCities = useQuery({
    queryKey: qk.tripCities(routeCities),
    queryFn: () => fetchCitiesByName(sb, routeCities),
    enabled: routeCities.length > 0,
    staleTime: 6 * 60 * 60_000,
  })
  // FX snapshot (migration 19). Owner decision 2026-07-25: rates are data, not
  // a preference, so nobody types them.
  const fx = useQuery({
    queryKey: qk.fx,
    queryFn: () => fetchFx(sb),
    staleTime: 60 * 60_000,
  })
  const cityIdx = useMemo(() => buildCityIndex(tripCities.data ?? []), [tripCities.data])

  // THE MERGE. state.rates does double duty: Object.keys() is the currency
  // picker list in Stays/Transport/Extras/Stops/Ledger, while the values feed
  // every total. So the trip document keeps owning WHICH currencies it watches
  // and the feed supplies only the VALUES — which means all ~15 consumers
  // (budget.ts, format.ts, every tab, MapClient, CountryPanel) need no change.
  //
  // A missing rate falls back to whatever the document already carried, so an
  // offline launch still totals correctly instead of showing zeros.
  const merged = useMemo(() => {
    if (!trip.data || !fx.data) return trip
    const base = trip.data.state.meta?.baseCurrency || 'HUF'
    const stored = trip.data.state.rates ?? {}
    const rates: Record<string, number> = {}
    for (const code of Object.keys(stored)) {
      rates[code] = crossRate(fx.data.perUsd, code, base) ?? stored[code]
    }
    rates[base] = 1
    return { ...trip, data: { ...trip.data, state: { ...trip.data.state, rates } } }
  }, [trip, fx.data])

  return { trip: merged, cities, tripCities, cityIdx, fx }
}
