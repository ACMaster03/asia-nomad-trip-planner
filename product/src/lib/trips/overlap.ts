import type { Segment } from './types'

// Overlapping-stops detection (M0-gate gap 6). Two in-plan stops that claim
// the same calendar night make the budget silently double-count it — accom
// AND daily-living are both summed per stop (computeBudget), so a shared
// night is money counted twice, not a style issue.
//
// Night semantics match segNights/nightsBetween (format.ts): a stop occupies
// the HALF-OPEN interval [arrive, depart). A same-day handoff — depart equals
// the next stop's arrive — is the normal travel day and is NOT an overlap.
// An explicit Segment.nights override changes the budget math, not the
// calendar; overlap is a calendar question, so arrive/depart decide alone.
//
// Pure function, no UI: the itinerary warning renders from this in the UI
// phase; tests exercise it headless (overlap.test.ts).

export interface StopOverlap {
  /** the two stops, in arrive order */
  aId: string
  bId: string
  aCity: string
  bCity: string
  /** first shared night (ISO date) */
  from: string
  /** the night AFTER the last shared one (exclusive, ISO date) — same
   *  half-open convention as the segments themselves */
  until: string
  /** how many nights the budget double-counts */
  nights: number
}

const DAY = 86_400_000

function parseDay(iso: string | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso + 'T00:00:00Z')
  return Number.isNaN(t) ? null : t
}

/**
 * All pairwise calendar overlaps among IN-PLAN stops (include !== false —
 * same filter as computeBudget: out-of-plan stops don't count, so they can't
 * double-count either). Stops with missing/invalid dates or depart <= arrive
 * occupy no nights and never overlap. Result is ordered by the earlier
 * stop's arrival, then the later's.
 */
export function findStopOverlaps(segments: Segment[]): StopOverlap[] {
  const stops = segments
    .filter((s) => s.include !== false)
    .map((s) => ({ s, a: parseDay(s.arrive), d: parseDay(s.depart) }))
    .filter((x): x is { s: Segment; a: number; d: number } =>
      x.a !== null && x.d !== null && x.d > x.a)
    .sort((x, y) => x.a - y.a || x.d - y.d)

  const out: StopOverlap[] = []
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      // sorted by arrive: once a later stop starts at/after i's depart,
      // every stop after it does too
      if (stops[j].a >= stops[i].d) break
      const from = Math.max(stops[i].a, stops[j].a)
      const until = Math.min(stops[i].d, stops[j].d)
      out.push({
        aId: stops[i].s.id,
        bId: stops[j].s.id,
        aCity: stops[i].s.city,
        bCity: stops[j].s.city,
        from: new Date(from).toISOString().slice(0, 10),
        until: new Date(until).toISOString().slice(0, 10),
        nights: Math.round((until - from) / DAY),
      })
    }
  }
  return out
}

/** Total double-counted nights — the headline number for the warning badge.
 *  Nights shared by THREE stops count twice here (each extra claim is one
 *  extra double-count), which is exactly what the budget over-adds. */
export function doubleCountedNights(segments: Segment[]): number {
  return findStopOverlaps(segments).reduce((a, o) => a + o.nights, 0)
}
