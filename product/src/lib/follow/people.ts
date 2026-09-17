import type { FollowedPerson, FollowedTripCard } from './follows.ts'
import type { Follower } from './social.ts'

// The People page: one shape for both tabs, a search that matches names and
// places, and country chips with counts. Pure functions; the page only maps
// RPC rows into PersonRow and renders what these return.

export interface PersonRow {
  user_id: string
  name: string
  /** the trip they are on right now, if open to followers */
  tripName: string | null
  city: string | null
  country: string | null
  /** 'paused' when their only listed trip is paused; 'on' when live; null when none */
  state: 'on' | 'paused' | null
  lastEventAt: string | null
  /** for the Following tab: the trip to open */
  trip_id: string | null
}

/** The trip to show for a followed person: the live one, else the newest listed. */
export function currentTrip(trips: readonly FollowedTripCard[]): FollowedTripCard | null {
  if (trips.length === 0) return null
  return trips.find((t) => t.state === 'on' && t.currentCity) ?? trips.find((t) => t.state === 'on') ?? trips[0]
}

export function rowFromFollowing(p: FollowedPerson): PersonRow {
  const t = currentTrip(p.trips)
  return {
    user_id: p.user_id,
    name: p.name,
    tripName: t?.tripName ?? null,
    city: t?.currentCity ?? null,
    country: t?.currentCountry ?? null,
    state: t?.state ?? null,
    lastEventAt: t?.lastEventAt ?? null,
    trip_id: t?.trip_id ?? null,
  }
}

export function rowFromFollower(f: Follower): PersonRow {
  return {
    user_id: f.user_id,
    name: f.name,
    tripName: f.location?.tripName ?? null,
    city: f.location?.city ?? null,
    country: f.location?.country ?? null,
    state: f.location ? 'on' : null,
    lastEventAt: null,
    trip_id: f.location?.trip_id ?? null,
  }
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/**
 * Case- and accent-insensitive; every whitespace-separated term must match
 * the name, the city, the country or the trip name. "kyoto" and "japan" both
 * find Bence; "dóri" and "dori" both find Dóri.
 */
export function matchesSearch(row: PersonRow, query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const hay = fold([row.name, row.city ?? '', row.country ?? '', row.tripName ?? ''].join(' '))
  return terms.every((t) => hay.includes(t))
}

export interface CountryChip {
  country: string
  count: number
}

/** Countries people are in right now, most people first, then alphabetical. */
export function countryChips(rows: readonly PersonRow[]): CountryChip[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (r.state === 'on' && r.country) counts.set(r.country, (counts.get(r.country) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
}

export type PeopleFilter = { kind: 'all' } | { kind: 'travelling' } | { kind: 'country'; country: string }

export function applyFilter(rows: readonly PersonRow[], filter: PeopleFilter, query: string): PersonRow[] {
  return rows
    .filter((r) => {
      if (filter.kind === 'travelling') return r.state === 'on' && !!r.city
      if (filter.kind === 'country') return r.state === 'on' && r.country === filter.country
      return true
    })
    .filter((r) => matchesSearch(r, query))
    .sort((a, b) => a.name.localeCompare(b.name) || a.user_id.localeCompare(b.user_id))
}
