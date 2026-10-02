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

/**
 * Home's off-route rule: the place named by the latest check-in, when it says
 * you are somewhere other than today's stop; null when nothing is off.
 *
 * Only a check-in made after the stop's arrival day counts. One from before
 * belongs to the stop you left: on 1 Oct, the day after the Bangkok → Hanoi
 * move, the last check-in still said Bangkok, and Home called Hanoi an
 * "off-route detour" in Bangkok (found 1 Oct). The arrival day itself already
 * has its own layout, and you may check in in either city on it.
 */
export function offRoutePlace(
  current: Pick<Segment, 'city' | 'arrive'> | undefined,
  checkin: { occurred_at: string; payload?: Record<string, unknown> | null } | undefined,
  now: Date,
): string | null {
  if (!current || !checkin) return null
  const place = typeof checkin.payload?.placeName === 'string' ? checkin.payload.placeName : ''
  if (!place) return null
  const at = new Date(checkin.occurred_at)
  if (+now - +at >= 48 * 3600_000) return null
  if (at.toISOString().slice(0, 10) <= current.arrive) return null
  return place.toLowerCase().includes(current.city.toLowerCase()) ? null : place
}
