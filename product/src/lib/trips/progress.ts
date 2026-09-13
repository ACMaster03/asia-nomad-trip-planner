import type { Segment, TripMeta } from './types'
import { nightsBetween, segNights } from './format.ts'

// ONE place for "what day of the trip is it" and "which night of this stop".
//
// Home and Live used to compute these separately and disagreed on the same
// morning (owner screenshots, 2026-09-11: Live said "Day 12 of 243 · night 11
// of 29 · 18 left", Home said "Day 12 of 73 · night 10 · 19 left"). The canon
// is FIXTURES.md: Day 1 = departure day, night 1 = arrival day, and the trip
// length is the trip's own dates — the planned stops only stand in when the
// trip is open-ended.

/** 1-based trip day; null before departure or without a start date. */
export function tripDay(meta: Pick<TripMeta, 'startDate'>, todayIso: string): number | null {
  if (!meta.startDate || todayIso < meta.startDate) return null
  return nightsBetween(meta.startDate, todayIso) + 1
}

/** Total trip days: start→end inclusive; falls back to planned nights when open-ended. */
export function tripLength(meta: Pick<TripMeta, 'startDate' | 'endDate'>, plannedNights: number): number | null {
  if (meta.startDate && meta.endDate) return nightsBetween(meta.startDate, meta.endDate) + 1
  return plannedNights > 0 ? plannedNights : null
}

export interface StopProgress {
  /** 1-based night at this stop, clamped to the stop's length */
  night: number
  nights: number
  left: number
  /** 0..100 */
  pct: number
}

export function stopProgress(seg: Segment, todayIso: string): StopProgress {
  const nights = Math.max(segNights(seg), 1)
  const night = Math.min(Math.max(nightsBetween(seg.arrive, todayIso) + 1, 1), nights)
  return { night, nights, left: nights - night, pct: Math.min(100, Math.round((night / nights) * 100)) }
}
