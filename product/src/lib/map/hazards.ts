import { quakesFromFeed, type Hazard } from './globeData'

// The live quake feed goes through React Query like every other remote read
// (issue #32 fix 8): one fetch per 15 minutes however often the Hazards
// switch flips, and a hard timeout so a slow USGS never pins the switch.
export const QUAKES_KEY = ['usgs-quakes'] as const
export const QUAKES_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson'
export const QUAKES_STALE_MS = 15 * 60_000
const TIMEOUT_MS = 8_000

export async function fetchQuakes(signal?: AbortSignal): Promise<Hazard[]> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(new DOMException('USGS feed timed out', 'TimeoutError')), TIMEOUT_MS)
  const onAbort = () => ac.abort(signal?.reason)
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const r = await fetch(QUAKES_URL, { signal: ac.signal })
    if (!r.ok) throw new Error(`USGS feed ${r.status}`)
    return quakesFromFeed(await r.json())
  } finally {
    clearTimeout(t)
    signal?.removeEventListener('abort', onAbort)
  }
}
