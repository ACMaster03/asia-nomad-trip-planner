import type { Segment, Stay, TransportLeg, TripState } from './types'
import { nightsBetween, segNights } from './format.ts'
import { isBookedStatus } from './commitment.ts'
import { normCity } from '../map/norm.ts'

// The Trip timeline (mock 15 §1, #58): home → leg → stop → leg → stop … →
// leg → home. Pure functions, node-testable; the screen only renders them.
//
// A LEG is derived, never stored: it is the space between two consecutive
// in-plan stops, plus the leg from home to the first stop and the way home
// after the last. Transport entries attach to a leg by their from/to city
// names, the same normalised match the globe uses to draw a flight, so a leg
// needs no new field on the document and every existing entry still finds
// its place. An entry that matches no leg is an ORPHAN and is listed under
// the timeline rather than dropped.
//
// A stop's stays cover NIGHTS. A stay with its own check-in/check-out covers
// those; a stay from before this build spans its stop (or its typed night
// count from the stop's arrival). The nights no counted stay covers are the
// amber "No bed" rows; nights two stays both claim are the per-stop overlap
// warning. Both are computed only once the stop has a stay at all: a stop
// with none says "No stay yet", which is a different sentence.

const DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10)

/** "24 Nov" — UTC parse, like reminders.ts. */
export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** "Budapest, Hungary" → "Budapest". */
export const homeCity = (homeBase?: string) => (homeBase ?? '').split(',')[0].trim()

/** A stay counts in the plan — the same flag budget.ts sums. */
export const stayCounts = (st: Stay) => !!st.include

export interface NightRange {
  from: string
  /** exclusive, half-open like the stops themselves */
  to: string
  nights: number
}
const range = (from: string, to: string): NightRange => ({ from, to, nights: nightsBetween(from, to) })

/** The nights a stay covers, or null when neither it nor its stop has usable dates. */
export function stayRange(st: Stay, seg: Segment): NightRange | null {
  if (st.checkIn && st.checkOut && st.checkOut > st.checkIn) return range(st.checkIn, st.checkOut)
  if (!seg.arrive || !seg.depart || seg.depart <= seg.arrive) return null
  if (st.nights != null && st.nights > 0) return { from: seg.arrive, to: addDays(seg.arrive, st.nights), nights: st.nights }
  return { from: seg.arrive, to: seg.depart, nights: segNights(seg) }
}

export interface StopCoverage {
  /** counted stays with the nights they cover, in date order */
  covered: { stay: Stay; range: NightRange }[]
  /** nights inside the stop that no counted stay covers */
  gaps: NightRange[]
  /** nights two counted stays both claim */
  overlaps: NightRange[]
}

export function stopCoverage(seg: Segment, stays: Stay[]): StopCoverage {
  const covered = stays
    .filter(stayCounts)
    .map((stay) => ({ stay, range: stayRange(stay, seg) }))
    .filter((x): x is { stay: Stay; range: NightRange } => x.range !== null)
    .sort((a, b) => a.range.from.localeCompare(b.range.from) || a.range.to.localeCompare(b.range.to))
  const gaps: NightRange[] = []
  const overlaps: NightRange[] = []
  if (!covered.length || !seg.arrive || !seg.depart || seg.depart <= seg.arrive) return { covered, gaps, overlaps }
  // Walk the stop's nights. `cursor` is the first night not yet covered.
  let cursor = seg.arrive
  let first = true
  for (const { range: r } of covered) {
    if (r.from > cursor && cursor < seg.depart) {
      const g = range(cursor, r.from < seg.depart ? r.from : seg.depart)
      if (g.nights > 0) gaps.push(g)
    } else if (!first && r.from < cursor) {
      const o = range(r.from, r.to < cursor ? r.to : cursor)
      if (o.nights > 0) overlaps.push(o)
    }
    if (r.to > cursor) cursor = r.to
    first = false
  }
  if (cursor < seg.depart) gaps.push(range(cursor, seg.depart))
  return { covered, gaps, overlaps }
}

export interface LegEnd {
  kind: 'home' | 'stop'
  city: string
  seg?: Segment
}
export interface Leg {
  key: string
  /** 1-based, in journey order */
  index: number
  from: LegEnd
  to: LegEnd
  /** the day it happens: the departure of the stop it leaves, or the first stop's arrival for the leg from home */
  date: string
  /** every entry on this leg, booked first */
  transport: TransportLeg[]
  booked: TransportLeg | null
}
export interface Timeline {
  home: string
  /** in-plan stops in date order */
  stops: Segment[]
  legs: Leg[]
  /** transport entries whose from/to match no leg */
  orphans: TransportLeg[]
}

const byArrive = (a: Segment, b: Segment) => {
  const t = (d: string) => { const n = Date.parse(d); return Number.isNaN(n) ? Infinity : n }
  return t(a.arrive) - t(b.arrive)
}
const endId = (e: LegEnd) => (e.kind === 'home' ? 'home' : e.seg!.id)

/** Which leg an entry sits on, by its from/to cities — the globe's match (flightFor). */
export function legFor(legs: Leg[], t: Pick<TransportLeg, 'from' | 'to'>): Leg | undefined {
  return legs.find((l) => normCity(l.from.city) === normCity(t.from) && normCity(l.to.city) === normCity(t.to))
}

export function buildTimeline(state: TripState): Timeline {
  const home = homeCity(state.meta.homeBase)
  const stops = state.segments.filter((s) => s.include !== false).slice().sort(byArrive)
  const ends: LegEnd[] = []
  if (home) ends.push({ kind: 'home', city: home })
  for (const seg of stops) ends.push({ kind: 'stop', city: seg.city, seg })
  if (home && stops.length) ends.push({ kind: 'home', city: home })
  const legs: Leg[] = []
  for (let i = 0; i + 1 < ends.length; i++) {
    const from = ends[i]
    const to = ends[i + 1]
    legs.push({
      key: `${endId(from)}->${endId(to)}`,
      index: legs.length + 1,
      from,
      to,
      date: from.kind === 'stop' ? from.seg!.depart : (to.seg?.arrive ?? ''),
      transport: [],
      booked: null,
    })
  }
  const orphans: TransportLeg[] = []
  for (const t of state.transport) {
    const leg = legFor(legs, t)
    if (leg) leg.transport.push(t)
    else orphans.push(t)
  }
  for (const leg of legs) {
    leg.transport.sort((a, b) => Number(isBookedStatus(b.status)) - Number(isBookedStatus(a.status)))
    leg.booked = leg.transport.find((t) => isBookedStatus(t.status)) ?? null
  }
  return { home, stops, legs, orphans }
}

export type Tone = 'ok' | 'warn' | 'muted'
export interface MoneyState {
  label: string
  tone: Tone
}

/** The one money line under a stay row: paid, charged on, at check-in, or still to enter. */
export function stayMoneyState(st: Stay, todayIso: string): MoneyState {
  if (!isBookedStatus(st.status)) return { label: st.ppn > 0 ? 'idea' : 'idea · no price', tone: 'muted' }
  if (st.chargeDate) {
    return st.chargeDate <= todayIso
      ? { label: `paid ${shortDate(st.chargeDate)}`, tone: 'ok' }
      : { label: `card charged on ${shortDate(st.chargeDate)}`, tone: 'warn' }
  }
  if (st.chargeAtCheckIn) return { label: 'card charged at check-in', tone: 'warn' }
  return { label: 'deadlines not set', tone: 'warn' }
}

/** The money line on a leg strip. A fare charged on booking reads paid from its charge date; otherwise the travel date is the charge, as importCosts assumes. */
export function legMoneyState(t: TransportLeg, todayIso: string): MoneyState {
  if (!isBookedStatus(t.status)) return { label: t.price > 0 ? 'idea' : 'idea · no price', tone: 'muted' }
  const date = t.chargeDate || t.date
  if (!date) return { label: 'booked', tone: 'ok' }
  return date <= todayIso
    ? { label: `paid ${shortDate(date)}`, tone: 'ok' }
    : { label: `card charged on ${shortDate(date)}`, tone: 'warn' }
}

/** A booked stay whose deadlines were never entered: no cancel-by answer, or no charge answer (#60). */
export function deadlinesMissing(st: Stay): boolean {
  if (!isBookedStatus(st.status)) return false
  const cancelKnown = !!st.cancelUntil || !!st.noFreeCancel
  const chargeKnown = !!st.chargeDate || !!st.chargeAtCheckIn
  return !cancelKnown || !chargeKnown
}

/** Two states everywhere (decided in round 1): Booked, or Idea. Legacy 'chosen' reads as Booked, 'shortlist' as Idea. */
export const stateOf = (status?: string): 'idea' | 'booked' => (isBookedStatus(status) ? 'booked' : 'idea')

/** Moving a stop's Leave moves the leg after it (mock 15 §4): entries dated on the old departure follow. */
export function shiftDepartures(transport: TransportLeg[], city: string, oldDepart: string, newDepart: string): TransportLeg[] {
  if (!oldDepart || !newDepart || oldDepart === newDepart) return transport
  return transport.map((t) => (normCity(t.from) === normCity(city) && t.date === oldDepart ? { ...t, date: newDepart } : t))
}
