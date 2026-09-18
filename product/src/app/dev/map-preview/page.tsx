import { notFound } from 'next/navigation'
import { dehydrate, QueryClient } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { tk } from '@/lib/trips/keys'
import { qk } from '@/lib/catalogue/keys'
import { fixtureTrip } from '../money-preview/fixture'
import { cities, countries } from './fixture'
import Preview from './Preview'

// DEV ONLY: the Map screen from fixtures, no sign-in needed (same wiring as
// money-preview). The catalogue refetches fail without a session and React
// Query keeps the seeded rows, which is what a preview wants. 404s outside
// development.
//   ?screen=knowledge&city=<id>  the Explore screen the map hands off to (fix 1)
export default async function MapPreviewPage({ searchParams }: { searchParams: Promise<{ screen?: string; city?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const params = await searchParams
  const qc = new QueryClient()
  const trip = fixtureTrip(new Date().toISOString().slice(0, 10))
  qc.setQueryData(tk.trip('fixture'), trip)
  qc.setQueryData(qk.cities, cities)
  qc.setQueryData(qk.citiesLite, cities.map((c) => ({ id: c.id, country: c.country, city: c.city, region: c.region, region_name: c.region_name, lat: c.lat, lng: c.lng, daily_living_mid: c.daily_living_mid, accom_mid: c.accom_mid })))
  qc.setQueryData(qk.countries, countries)
  const names = [...new Set(trip.state.segments.map((s) => s.city))]
  qc.setQueryData(qk.tripCities(names), cities.filter((c) => names.includes(c.city)))
  qc.setQueryData(qk.fields, [])
  for (const c of cities) qc.setQueryData(['city-detail', c.id], c)
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <Preview screen={params.screen === 'knowledge' ? 'knowledge' : 'map'} />
    </HydrationBoundary>
  )
}
