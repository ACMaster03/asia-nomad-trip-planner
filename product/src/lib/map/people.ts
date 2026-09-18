import type { City } from '../catalogue/types.ts'
import type { Segment } from '../trips/types.ts'
import type { SharedRouteStop } from '../follow/api.ts'
import type { FollowedPerson, FollowedSummary } from '../follow/follows.ts'
import { currentTrip } from '../follow/people.ts'
import { normCity } from './norm.ts'

// Issue #9 — where our routes touch. Pure functions over the two projections
// the app already fetches: my_following() (who is in which city now) and
// followed_trip_summary() (their whole itinerary with dates). Nothing here
// touches the network; the map and Home only render what these return.

export type Summaries = Record<string, FollowedSummary | null | undefined>

/** One followed traveller standing in a city right now. */
export interface PersonHere {
  user_id: string
  name: string
  trip_id: string
  tripName: string
  /** the day they leave this city, when their route says so */
  until: string | null
}

/** A city with at least one followed traveller in it — the people layer's unit. */
export interface PeopleAtCity {
  key: string
  city: string
  country: string | null
  lat: number
  lng: number
  people: PersonHere[]
}

/** The stop of a route that covers `today`, if any. */
export function stopOn(route: readonly SharedRouteStop[], today: string): SharedRouteStop | null {
  return route.find((s) => s.arrive <= today && today < s.depart) ?? null
}

/**
 * Group the people you follow by the city they are in. Coordinates come from
 * the catalogue when the city is in it, otherwise from the traveller's own
 * route (the summary bakes lat/lng per stop), otherwise the person is not
 * drawn — a name is never enough to put a mark on the globe.
 */
export function peopleByCity(
  following: readonly FollowedPerson[],
  cities: readonly City[],
  summaries: Summaries,
  today: string,
): PeopleAtCity[] {
  const groups = new Map<string, PeopleAtCity>()
  for (const p of following) {
    const t = currentTrip(p.trips)
    if (!t || t.state !== 'on' || !t.currentCity) continue
    const key = normCity(t.currentCity)
    const summary = summaries[t.trip_id] ?? null
    const routeStop = summary?.route.find((s) => normCity(s.city) === key && s.lat != null && s.lng != null) ?? null
    const cat = cities.find((c) => normCity(c.city) === key && c.lat != null && c.lng != null) ?? null
    const lat = cat?.lat ?? routeStop?.lat
    const lng = cat?.lng ?? routeStop?.lng
    if (lat == null || lng == null) continue
    const here = summary ? stopOn(summary.route, today) : null
    const person: PersonHere = {
      user_id: p.user_id, name: p.name, trip_id: t.trip_id, tripName: t.tripName,
      until: here && normCity(here.city) === key ? here.depart : null,
    }
    const g = groups.get(key)
    if (g) g.people.push(person)
    else groups.set(key, { key, city: cat?.city ?? t.currentCity, country: cat?.country ?? t.currentCountry ?? routeStop?.country ?? null, lat, lng, people: [person] })
  }
  return [...groups.values()]
    .map((g) => ({ ...g, people: g.people.slice().sort((a, b) => a.name.localeCompare(b.name) || a.user_id.localeCompare(b.user_id)) }))
    .sort((a, b) => b.people.length - a.people.length || a.city.localeCompare(b.city))
}

/** Same city, intersecting dates: the thing to act on. */
export interface Overlap {
  city: string
  country: string
  start: string
  end: string
}

/**
 * Where my itinerary and one followed route touch, today or later. Days are
 * ISO strings compared as text; a stay's `depart` day counts (you can still
 * meet on the morning you leave).
 */
export function overlaps(mine: readonly Segment[], theirs: readonly SharedRouteStop[], today: string): Overlap[] {
  const out: Overlap[] = []
  const seen = new Set<string>()
  for (const m of mine) {
    if (m.include === false || !m.arrive || !m.depart) continue
    const key = normCity(m.city)
    for (const t of theirs) {
      if (normCity(t.city) !== key) continue
      const start = m.arrive > t.arrive ? m.arrive : t.arrive
      const end = m.depart < t.depart ? m.depart : t.depart
      if (start > end || end < today) continue
      const id = `${key}|${start}|${end}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ city: m.city, country: m.country || t.country, start, end })
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.city.localeCompare(b.city))
}

/**
 * Every overlap between my itinerary and the people I follow, soonest first.
 * Travellers on the SAME trip share one line — a couple you follow is one
 * meet-up, not two.
 */
export interface PersonOverlap extends Overlap {
  trip_id: string
  /** the followed travellers on that trip, alphabetical */
  names: string[]
}
export function allOverlaps(
  mine: readonly Segment[],
  following: readonly FollowedPerson[],
  summaries: Summaries,
  today: string,
): PersonOverlap[] {
  const byKey = new Map<string, PersonOverlap>()
  for (const p of following) {
    for (const t of p.trips) {
      if (t.state !== 'on') continue
      const s = summaries[t.trip_id]
      if (!s) continue
      for (const o of overlaps(mine, s.route, today)) {
        const key = `${t.trip_id}|${normCity(o.city)}|${o.start}|${o.end}`
        const row = byKey.get(key)
        if (row) { if (!row.names.includes(p.name)) row.names.push(p.name) }
        else byKey.set(key, { ...o, trip_id: t.trip_id, names: [p.name] })
      }
    }
  }
  return [...byKey.values()]
    .map((r) => ({ ...r, names: r.names.slice().sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.names[0].localeCompare(b.names[0]))
}

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** "12–15 Oct", "28 Sep – 3 Oct", or "12 Oct" for a single day. */
export function formatRange(start: string, end: string): string {
  if (start === end) return day(start)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  if (sameMonth) return `${Number(start.slice(8, 10))}–${day(end)}`
  return `${day(start)} – ${day(end)}`
}

/** The line the app writes by itself. */
export function formatOverlap(o: Overlap, who: string | readonly string[], today: string): string {
  const names = typeof who === 'string' ? [who] : who
  const subject = names.length === 1
    ? `You and ${names[0]} are both`
    : `You, ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are all`
  if (o.start <= today) return `${subject} in ${o.city} until ${day(o.end)}`
  if (o.start === o.end) return `${subject} in ${o.city} on ${day(o.start)}`
  return `${subject} in ${o.city}, ${formatRange(o.start, o.end)}`
}
