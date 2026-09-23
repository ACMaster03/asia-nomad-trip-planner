import { notFound } from 'next/navigation'
import { dehydrate, QueryClient } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { tk } from '@/lib/trips/keys'
import { qk } from '@/lib/catalogue/keys'
import type { Trip } from '@/lib/trips/types'
import { fixtureTrip } from '../money-preview/fixture'
import { cities } from '../map-preview/fixture'
import Preview from './Preview'

// DEV ONLY: the Trip timeline from a fixture, no sign-in needed (the same
// wiring as money-preview). The fixture is the Money one with the stays and
// legs mock 15 shows: a Da Nang stay that leaves a gap, a booked flight with
// a connection, an idea flight with no price, nothing yet on the last two
// legs, and one old option that never counted. 404s outside development.
export default async function TripPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  const today = new Date().toISOString().slice(0, 10)
  const base = fixtureTrip(today)
  const trip: Trip = {
    ...base,
    state: {
      ...base.state,
      stays: [
        { id: 'st1', segId: 'bkk', name: 'Home in Khet Huai Khwang', platform: 'Booking.com', cur: 'USD', ppn: 33.71, nights: 29, status: 'chosen', include: true, chargeDate: '2026-07-09', cancelUntil: '2026-06-30' },
        { id: 'st2', segId: 'han', name: 'Văn Giang (Mai Kenny)', platform: 'Airbnb', cur: 'USD', ppn: 29, status: 'chosen', include: true, chargeDate: '2026-09-29', cancelUntil: '2026-09-26' },
        { id: 'st3', segId: 'dad', name: 'An Bang beach house', platform: 'Airbnb', cur: 'USD', ppn: 41, status: 'booked', include: true, checkIn: '2026-11-13', checkOut: '2026-11-30', chargeAtCheckIn: true, chargeDate: '2026-11-13', noFreeCancel: true },
        { id: 'st4', segId: 'dad', name: 'Hoi An old town loft', platform: 'Airbnb', cur: 'USD', ppn: 38, status: 'shortlist', include: false },
      ],
      transport: [
        { id: 't1', type: 'flight', from: 'Budapest', to: 'Bangkok', date: '2026-08-31', time: '13:20', via: 'Shanghai', hours: 14.58, cur: 'HUF', price: 248_000, status: 'booked', include: true, chargeDate: '2026-07-09' },
        { id: 't2', type: 'flight', from: 'Bangkok', to: 'Hanoi', date: '2026-09-30', cur: 'USD', price: 0, status: 'idea', include: true },
        // Goes to a city that is not a stop: lands under the timeline as "not on a leg" (Petra's real case, 2026-09-23).
        { id: 't3', type: 'flight', from: 'Da Nang', to: 'Hong Kong', date: '2026-12-13', cur: 'USD', price: 258, status: 'booked', include: true, chargeDate: '2026-09-15' },
      ],
    },
  }
  const qc = new QueryClient()
  qc.setQueryData(tk.trip('fixture'), trip)
  qc.setQueryData(qk.citiesLite, cities.map((c) => ({ id: c.id, country: c.country, city: c.city, region: c.region, region_name: c.region_name, lat: c.lat, lng: c.lng, daily_living_mid: c.daily_living_mid, accom_mid: c.accom_mid })))
  const names = [...new Set(trip.state.segments.map((s) => s.city))]
  qc.setQueryData(qk.tripCities(names), cities.filter((c) => names.includes(c.city)))
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <Preview />
    </HydrationBoundary>
  )
}
