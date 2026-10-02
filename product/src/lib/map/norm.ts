import type { City } from '../catalogue/types'

// The one way a stop name is matched to a catalogue or route city: drop a
// parenthesised suffix, trim, lowercase. Lives alone so node --test files
// (which resolve no `@/` alias) can import it without pulling the globe in.
export const normCity = (s?: string) => String(s ?? '').split(' (')[0].trim().toLowerCase()

// The same place under two spellings: "Hong Kong" and "Hong Kong Island",
// "Da Nang" and "Da Nang City". One name is the other plus more words, at a
// word boundary, so "York" is not "New York". Petra, 2026-09-23: a flight
// typed as "Hong Kong" on the old Transport tab found no leg to the stop
// "Hong Kong Island", and the timeline listed it as lost.
export const sameCity = (a?: string, b?: string) => {
  const x = normCity(a)
  const y = normCity(b)
  if (!x || !y) return false
  return x === y || x.startsWith(y + ' ') || y.startsWith(x + ' ')
}

/**
 * The catalogue city a stop's name means: the exact name first, else the same
 * place under another spelling (sameCity). `placed`: only cities with
 * coordinates, for the globe. The globe, the Map's card and Money's city
 * averages all looked stops up by exact name, so Asia's stop "Hong Kong
 * Island" found nothing next to the catalogue's "Hong Kong": off the map, no
 * wifi line, no city average, all in silence (Patrik, 27 Sep).
 */
export function catalogueCity<C extends Pick<City, 'city' | 'lat' | 'lng'>>(name: string, cities: readonly C[], placed = true): C | undefined {
  const ok = (c: C) => !placed || (c.lat != null && c.lng != null)
  return cities.find((c) => ok(c) && c.city === name) ?? cities.find((c) => ok(c) && sameCity(c.city, name))
}
