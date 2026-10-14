import type { Segment, TripMeta } from '../trips/types'

// The globe on top of Trip (round 3b of the redesign, after the phone's
// GlobeModel): where the camera sits over a journey, how long a leg takes to
// fly in a replay, and the words on the open globe's card. Pure, node-tested;
// TripGlobe.tsx only applies them.

export interface LatLng { lat: number; lng: number }
export interface Camera extends LatLng { altitude: number }

const R = Math.PI / 180

/** Great-circle distance in degrees. */
export function angDeg(a: LatLng, b: LatLng): number {
  const s = Math.sin((b.lat - a.lat) * R / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin((b.lng - a.lng) * R / 2) ** 2
  return 2 * Math.asin(Math.min(1, Math.sqrt(s))) / R
}

/** The middle of a set of places, through the sphere (so Tokyo and Honolulu do not meet in Africa). */
export function centroid(points: LatLng[]): LatLng | null {
  if (!points.length) return null
  let x = 0, y = 0, z = 0
  for (const p of points) {
    const lat = p.lat * R, lng = p.lng * R
    x += Math.cos(lat) * Math.cos(lng)
    y += Math.cos(lat) * Math.sin(lng)
    z += Math.sin(lat)
  }
  const n = points.length
  x /= n; y /= n; z /= n
  const hyp = Math.sqrt(x * x + y * y)
  if (hyp < 1e-9 && Math.abs(z) < 1e-9) return { lat: points[0].lat, lng: points[0].lng }
  return { lat: Math.atan2(z, hyp) / R, lng: Math.atan2(y, x) / R }
}

/** The widest gap between any two of the places, in degrees. */
export function spreadDeg(points: LatLng[]): number {
  let max = 0
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) max = Math.max(max, angDeg(points[i], points[j]))
  return max
}

/** Somewhere over Asia, for a journey with no places yet. */
export const DEFAULT_CAMERA: Camera = { lat: 20, lng: 100, altitude: 2.4 }

/** As far out as the globe's controls allow (globe.gl: the camera at 5 radii). */
export const MAX_ALTITUDE = 4

/**
 * Over the whole journey: its middle, high enough for every stop to show with
 * room around it on a phone held upright, where the globe's width is the
 * tight side (the camera's field of view is vertical).
 */
export function journeyCamera(points: LatLng[]): Camera {
  const c = centroid(points)
  if (!c) return DEFAULT_CAMERA
  const spread = spreadDeg(points)
  return { ...c, altitude: Math.min(MAX_ALTITUDE, Math.max(0.75, 0.5 + spread / 36)) }
}

/** The world: the journey's side of it, from as far out as it goes. */
export function worldCamera(points: LatLng[]): Camera {
  const c = centroid(points) ?? DEFAULT_CAMERA
  return { lat: c.lat, lng: c.lng, altitude: MAX_ALTITUDE }
}

/** Over one stop, close. */
export function stopCamera(p: LatLng): Camera {
  return { lat: p.lat, lng: p.lng, altitude: 0.9 }
}

/**
 * The great circle from a to b as [lng, lat] points, one every `stepDeg` degrees at most,
 * so a line drawn through them hugs the globe instead of cutting through it.
 */
export function geodesic(a: LatLng, b: LatLng, stepDeg = 2): [number, number][] {
  const d = angDeg(a, b)
  const n = Math.max(2, Math.ceil(d / stepDeg) + 1)
  const toXyz = (p: LatLng) => [Math.cos(p.lat * R) * Math.cos(p.lng * R), Math.cos(p.lat * R) * Math.sin(p.lng * R), Math.sin(p.lat * R)]
  const A = toXyz(a), B = toXyz(b)
  const w = d * R
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    let x: number, y: number, z: number
    if (w < 1e-9) { x = A[0]; y = A[1]; z = A[2] }
    else {
      const ka = Math.sin((1 - t) * w) / Math.sin(w), kb = Math.sin(t * w) / Math.sin(w)
      x = ka * A[0] + kb * B[0]; y = ka * A[1] + kb * B[1]; z = ka * A[2] + kb * B[2]
    }
    out.push([Math.atan2(y, x) / R, Math.atan2(z, Math.sqrt(x * x + y * y)) / R])
  }
  return out
}

/** How long a leg takes to fly in a replay: longer legs take longer, within reason. */
export function legDuration(a: LatLng, b: LatLng): number {
  return Math.min(2400, Math.max(900, Math.round(700 + angDeg(a, b) * 22)))
}

/** The card at the bottom of the open globe: the stop, and one line under it (the phone's `peek`). */
export function peekText<S extends Pick<Segment, 'city' | 'arrive' | 'depart' | 'include'>>(
  meta: Pick<TripMeta, 'tripName'>,
  segments: S[],
  todayIso: string,
  shortDate: (iso: string) => string,
  nightsOf: (s: S) => number,
): { title: string; line: string } {
  const inPlan = segments.filter((s) => s.include !== false).slice().sort((a, b) => a.arrive.localeCompare(b.arrive))
  const cur = inPlan.find((s) => !!s.arrive && !!s.depart && s.arrive <= todayIso && todayIso < s.depart)
  const next = inPlan.find((s) => s.arrive > todayIso)
  const lines: string[] = []
  if (cur) {
    const n = Math.max(nightsOf(cur), 1)
    const night = Math.min(Math.max(Math.round((Date.parse(todayIso + 'T00:00:00Z') - Date.parse(cur.arrive + 'T00:00:00Z')) / 86_400_000) + 1, 1), n)
    lines.push(`Night ${night} of ${n}`)
  }
  if (next) lines.push(`${next.city} next, ${shortDate(next.arrive)}`)
  return { title: cur?.city ?? next?.city ?? meta.tripName, line: lines.join(' · ') }
}
