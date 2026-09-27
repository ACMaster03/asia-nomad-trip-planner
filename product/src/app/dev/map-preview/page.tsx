import { notFound } from 'next/navigation'
import { dehydrate, QueryClient } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { tk } from '@/lib/trips/keys'
import { qk } from '@/lib/catalogue/keys'
import { fixtureTrip } from '../money-preview/fixture'
import { cities, countries, following, summaries } from './fixture'
import { catalogueCity } from '@/lib/map/norm'
import Preview, { type Screen } from './Preview'

// DEV ONLY: the Map screen from fixtures, no sign-in needed (same wiring as
// money-preview). The catalogue refetches fail without a session and React
// Query keeps the seeded rows, which is what a preview wants. 404s outside
// development.
//   ?screen=knowledge&city=<id>  the Explore screen the map hands off to (fix 1)
//   ?screen=home                 Home, for the meet-up line under the people strip (#9)
//   ?hk=1                        adds Asia's third stop as it is spelt there, "Hong Kong
//                                Island", which the catalogue knows as "Hong Kong" (27 Sep)
const SCREENS: Screen[] = ['map', 'knowledge', 'home']
export default async function MapPreviewPage({ searchParams }: { searchParams: Promise<{ screen?: string; city?: string; hk?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const params = await searchParams
  const qc = new QueryClient()
  const trip = fixtureTrip(new Date().toISOString().slice(0, 10))
  if (params.hk) {
    trip.state.segments.push({ id: 'hkg', country: 'Hong Kong', city: 'Hong Kong Island', arrive: '2026-12-13', depart: '2026-12-20', tier: 1 })
    trip.state.transport.push({ id: 't-hk', type: 'flight', from: 'Da Nang', to: 'Hong Kong', date: '2026-12-13', cur: 'USD', price: 258, status: 'booked', include: true })
  }
  qc.setQueryData(tk.trip('fixture'), trip)
  qc.setQueryData(qk.cities, cities)
  qc.setQueryData(qk.citiesLite, cities.map((c) => ({ id: c.id, country: c.country, city: c.city, region: c.region, region_name: c.region_name, lat: c.lat, lng: c.lng, daily_living_mid: c.daily_living_mid, accom_mid: c.accom_mid })))
  qc.setQueryData(qk.countries, countries)
  // seeded under the catalogue's spelling of each stop, the key useTripScreen asks for
  const names = [...new Set(trip.state.segments.map((s) => catalogueCity(s.city, cities, false)?.city ?? s.city))]
  qc.setQueryData(qk.tripCities(names), cities.filter((c) => names.includes(c.city)))
  qc.setQueryData(qk.fields, [])
  qc.setQueryData(tk.following, following)
  qc.setQueryData(tk.events('fixture'), [])
  qc.setQueryData(['follower-count'], 2)
  for (const [id, sm] of Object.entries(summaries)) qc.setQueryData(tk.followedSummary(id), sm)
  for (const c of cities) qc.setQueryData(['city-detail', c.id], c)
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <Preview screen={SCREENS.includes(params.screen as Screen) ? (params.screen as Screen) : 'map'} />
    </HydrationBoundary>
  )
}
