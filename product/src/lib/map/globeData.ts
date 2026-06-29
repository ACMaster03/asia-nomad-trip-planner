import type { City } from '@/lib/catalogue/types'
import type { Segment, TransportLeg } from '@/lib/trips/types'
import type { CityCost } from '@/lib/trips/budget'
import { regColor } from '@/lib/trips/format'
import { getAtJsonPath } from '@/lib/catalogue/getAtJsonPath'

export type MapOpts = { rotate: boolean; day: boolean; borders: boolean; hazards: boolean }
const LS = 'anp_map_opts'
export function loadMapOpts(): MapOpts {
  try {
    const s = localStorage.getItem(LS)
    if (s) {
      const o = JSON.parse(s)
      return { rotate: o.rotate !== false, day: !!o.day, borders: !!o.borders, hazards: !!o.hazards }
    }
  } catch {}
  return { rotate: true, day: false, borders: false, hazards: false }
}
export function saveMapOpts(o: MapOpts) { try { localStorage.setItem(LS, JSON.stringify(o)) } catch {} }

export const normCity = (s?: string) => String(s ?? '').split(' (')[0].trim().toLowerCase()
export const isBooked = (t?: TransportLeg | null) => !!(t && (t.status === 'booked' || t.status === 'chosen'))

export function flightFor(transport: TransportLeg[], aCity: string, bCity: string) {
  const na = normCity(aCity), nb = normCity(bCity)
  const m = transport.filter((t) => normCity(t.from) === na && normCity(t.to) === nb)
  if (!m.length) return null
  return m.find(isBooked) ?? m.find((t) => t.include) ?? m[0]
}

const HOME_PLACES: Record<string, { lat: number; lng: number; country: string }> = {
  Budapest: { lat: 47.4979, lng: 19.0402, country: 'Hungary' },
  Vienna: { lat: 48.2082, lng: 16.3738, country: 'Austria' },
}

export interface RouteNode {
  city: string; country: string; r: string | null
  lat: number; lng: number; arrive: string
  home?: boolean; num?: number; label?: string
}
export interface GlobePoint {
  lat: number; lng: number; city: string; country: string; r: string | null
  city_?: City; home?: boolean
  color: string; radius: number; alt: number
}
export interface GlobeArc {
  startLat: number; startLng: number; endLat: number; endLng: number
  from: string; to: string; flight: TransportLeg | null; booked: boolean
  color: string | string[]; stroke: number; dashLen: number; dashGap: number; anim: number
}
export interface Hazard {
  lat: number; lng: number; kind: 'season' | 'quake'; haz: true
  city?: string; rain?: number; hazardText?: string
  mag?: number; place?: string; time?: number; url?: string
  color: string; radius: number; alt: number; maxR: number; speed: number; period: number
}

export function detectOrigin(stops: RouteNode[], transport: TransportLeg[], cities: City[]): RouteNode | null {
  if (!stops.length) return null
  const seen = new Set(stops.map((s) => normCity(s.city)))
  const inbound = transport
    .filter((t) => t.include !== false)
    .find((t) => normCity(t.to) === normCity(stops[0].city) && !seen.has(normCity(t.from)))
  if (!inbound) return null
  const name = String(inbound.from).split(' (')[0].trim()
  const hp = HOME_PLACES[name]
  const c = cities.find((x) => x.city === name && x.lat != null)
  const p = hp ?? (c ? { lat: c.lat!, lng: c.lng!, country: c.country } : null)
  if (!p) return null
  return { city: name, country: p.country ?? '', lat: p.lat, lng: p.lng, r: null, home: true, arrive: '' }
}

export function buildRoute(segments: Segment[], cities: City[], cityIdx: Record<string, CityCost>, transport: TransportLeg[]) {
  const stops: RouteNode[] = segments
    .filter((s) => s.include !== false)
    .map((s) => {
      const c = cities.find((x) => x.city === s.city)
      if (!c || c.lat == null || c.lng == null) return null
      return {
        city: s.city, country: s.country, r: cityIdx[s.city]?.r ?? c.region ?? null,
        lat: c.lat, lng: c.lng!, arrive: s.arrive || '',
      } as RouteNode
    })
    .filter((x): x is RouteNode => x != null)
    .sort((a, b) => (a.arrive < b.arrive ? -1 : a.arrive > b.arrive ? 1 : 0))
  const origin = detectOrigin(stops, transport, cities)
  const route = origin ? [origin, ...stops] : [...stops]
  let n = 0
  route.forEach((nd) => {
    nd.num = nd.home ? 0 : ++n
    nd.label = nd.home ? `⌂ ${nd.city}` : `${nd.num}. ${nd.city}`
  })
  return { stops, route, origin }
}

export function buildArcs(route: RouteNode[], transport: TransportLeg[]): GlobeArc[] {
  const arcs: GlobeArc[] = []
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1]
    if (a.lat === b.lat && a.lng === b.lng) continue
    const f = flightFor(transport, a.city, b.city), booked = isBooked(f)
    const ca = a.home ? '#dfe6ee' : regColor(a.r), cb = b.home ? '#dfe6ee' : regColor(b.r)
    arcs.push({
      startLat: a.lat, startLng: a.lng, endLat: b.lat, endLng: b.lng,
      from: a.city, to: b.city, flight: f, booked,
      color: booked ? ['#f0a83c', '#f6c46a'] : [ca, cb],
      stroke: booked ? 1.1 : f ? 0.6 : 0.45,
      dashLen: booked ? 1 : 0.4, dashGap: booked ? 0 : 0.18, anim: booked ? 0 : 2500,
    })
  }
  return arcs
}

export function seasonalHazards(segments: Segment[], cities: City[]): Hazard[] {
  const mi = new Date().getMonth(), seen = new Set<string>(), out: Hazard[] = []
  for (const s of segments.filter((x) => x.include !== false)) {
    if (seen.has(s.city)) continue
    const c = cities.find((x) => x.city === s.city)
    if (!c || c.lat == null || c.lng == null) continue
    const months = getAtJsonPath(c.attributes, 'weather.months') as Array<{ rain?: number }> | undefined
    const m = Array.isArray(months) ? months[mi] : undefined
    if (m && (m.rain ?? 0) >= 250) {
      seen.add(s.city)
      const rain = m.rain as number
      out.push({
        lat: c.lat, lng: c.lng!, kind: 'season', haz: true, city: s.city, rain,
        hazardText: (getAtJsonPath(c.attributes, 'weather.hazard') as string) || '',
        color: '#f0a83c', radius: 0.5 + Math.min(0.5, (rain - 250) / 700), alt: 0.02,
        maxR: rain >= 400 ? 6 : 5, speed: 2, period: 1400,
      })
    }
  }
  return out
}

export const qColor = (m: number) => (m >= 6 ? '#ff4d4d' : m >= 5 ? '#ff7a45' : '#ffa270')
export function quakesFromFeed(j: { features?: unknown[] } | null): Hazard[] {
  return ((j?.features ?? []) as Array<{ geometry?: { coordinates?: number[] }; properties?: { mag?: number; place?: string; time?: number; url?: string } }>)
    .map((f) => {
      const c = f?.geometry?.coordinates, p = f?.properties ?? {}, mag = p.mag ?? 0
      return c
        ? ({
            lat: c[1], lng: c[0], kind: 'quake', haz: true, mag, place: p.place ?? '', time: p.time, url: p.url,
            color: qColor(mag), radius: Math.min(1.2, 0.42 + mag * 0.11), alt: 0.02,
            maxR: Math.min(9, 1.5 + mag), speed: 3, period: 900,
          } as Hazard)
        : null
    })
    .filter((x): x is Hazard => x != null)
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthName = () => MONTHS[new Date().getMonth()]
export function quakeSafetyNote(m: number) {
  if (m >= 6.5) return 'Strong quake — capable of serious damage near the epicentre. If this is on your route, check local news and authorities before travelling there.'
  if (m >= 5.5) return 'Moderate–strong — can cause damage close to the epicentre; usually localised.'
  if (m >= 4.5) return 'Light–moderate — widely felt but rarely damaging.'
  return 'Minor — generally not damaging.'
}
export const COUNTRY_ALIAS: Record<string, string> = { 'Lao PDR': 'Laos', 'Viet Nam': 'Vietnam', 'Republic of Korea': 'South Korea', 'Korea, Rep.': 'South Korea' }
export function isoToFlag(iso?: string | null) {
  if (!iso || iso.length !== 2 || iso.includes('-')) return '🏳️'
  return iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}
