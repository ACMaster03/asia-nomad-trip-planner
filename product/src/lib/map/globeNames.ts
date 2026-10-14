// The names on the globe (the phone's GlobeView.drawNames, mock round 5):
// continents lead far out, countries take over closer in, your journey's
// countries and your home's first, then the biggest. Pure; node-tested.

export interface GeoFeature {
  properties?: { name?: string; iso?: string }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }
}

export interface CountryLabel {
  name: string
  lat: number
  lng: number
  /** √(area), in degrees of the sphere; the bigger, the sooner the name shows */
  size: number
}

const R = Math.PI / 180

/** The outer rings of a feature, each as [lng, lat][] (GeoJSON order). */
export function outerRings(f: GeoFeature): number[][][] {
  const g = f.geometry
  if (g.type === 'Polygon') return [(g.coordinates as number[][][])[0]]
  return (g.coordinates as number[][][][]).map((poly) => poly[0])
}

/** A ring's area in square degrees on the sphere (the shoelace, with the parallels narrowed by cos lat), and its middle. */
export function ringSize(ring: number[][]): { area: number; lat: number; lng: number } {
  let a = 0, minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]
    a += x1 * y2 - x2 * y1
    if (y1 < minLat) minLat = y1
    if (y1 > maxLat) maxLat = y1
    if (x1 < minLng) minLng = x1
    if (x1 > maxLng) maxLng = x1
  }
  const lat = (minLat + maxLat) / 2
  return { area: Math.abs(a / 2) * Math.cos(lat * R), lat, lng: (minLng + maxLng) / 2 }
}

/** Every country that has a name, placed on its biggest piece of land, biggest first. */
export function countryLabels(features: GeoFeature[]): CountryLabel[] {
  const out: CountryLabel[] = []
  for (const f of features) {
    const name = f.properties?.name?.trim()
    if (!name || name === 'Antarctica') continue
    let best: { area: number; lat: number; lng: number } | null = null
    let total = 0
    for (const ring of outerRings(f)) {
      if (ring.length < 4) continue
      const s = ringSize(ring)
      total += s.area
      if (!best || s.area > best.area) best = s
    }
    if (!best) continue
    out.push({ name, lat: best.lat, lng: best.lng, size: Math.sqrt(total) })
  }
  return out.sort((a, b) => b.size - a.size)
}

/** The continents, hand-placed as on the phone's globe-names.json. */
export const CONTINENTS: { name: string; lat: number; lng: number }[] = [
  { name: 'Asia', lat: 46, lng: 92 },
  { name: 'Europe', lat: 52, lng: 18 },
  { name: 'Africa', lat: 4, lng: 20 },
  { name: 'Oceania', lat: -26, lng: 134 },
  { name: 'North America', lat: 46, lng: -100 },
  { name: 'South America', lat: -14, lng: -59 },
]

/** The phone's country spellings for the ones the shapes spell otherwise. */
const COUNTRY_ALIAS: Record<string, string> = { 'viet nam': 'vietnam', 'lao pdr': 'laos', 'republic of korea': 'south korea', 'korea, rep.': 'south korea', 'united states of america': 'united states', 'czechia': 'czech republic' }
export const normCountry = (s?: string | null) => {
  const k = (s ?? '').trim().toLowerCase()
  return COUNTRY_ALIAS[k] ?? k
}

/**
 * The order the names are tried in: your journey's countries first, then the biggest. Which
 * of them show is the screen's call (TripGlobe: big enough on screen for its name); none from
 * very far out, where the continents speak.
 */
export function pickCountryLabels(labels: CountryLabel[], altitude: number, mine: Set<string>): CountryLabel[] {
  if (altitude > 3.3) return []
  const first = labels.filter((l) => mine.has(normCountry(l.name)))
  const rest = labels.filter((l) => !mine.has(normCountry(l.name)))
  return [...first, ...rest]
}

/** The continents fade out as you come closer (the phone: (2.0 − k) / 0.55). */
export const continentOpacity = (altitude: number) => Math.max(0, Math.min(1, (altitude - 1.7) / 0.6))
/** Far out, only home and today keep their names, so close stops do not overlap. */
export const stopNamesShown = (altitude: number) => altitude <= 2.6
