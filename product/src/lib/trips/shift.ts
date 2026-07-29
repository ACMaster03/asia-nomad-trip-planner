import type { TripState, Segment, TransportLeg, Stay } from './types'

// "Shift the remaining stops by N days" (M0-gate gap 1). The drift badge
// (LiveClient "off plan · last arrived X") only *names* the problem; this is
// the affordance that fixes it — the plan is the thing that must change, not
// the label. Pure document mutation: takes a TripState, returns a new one
// plus a report of what moved and — just as important — what deliberately
// did NOT move, so the UI can warn instead of silently rewriting reality.
//
// What moves (in-plan only — parked include:false alternatives are not "the
// remaining stops"):
//   - segments arriving ON/AFTER the pivot: arrive and depart both shift
//   - the segment STRADDLING the pivot (arrive < pivot < depart): only its
//     depart moves — that's the "we're staying longer here" case. Shortening
//     never pulls its depart before the pivot (you can't depart in the past).
//   - transport legs dated on/after the pivot whose status is still an idea
//     or shortlist entry.
// What never moves:
//   - BOOKED (or legacy 'chosen') transport legs — a real flight doesn't
//     reschedule itself because the plan slipped; they're reported as pinned.
//   - stays: bookings carry real-world deadlines (cancelUntil/chargeDate),
//     not plan dates. Booked stays sitting on a shifted segment are reported
//     so the UI can say "your Chiang Mai booking no longer matches the plan".
//   - meta.endDate: the flight home is the fixedest point of all. If the
//     shifted plan now runs past it, overrunDays says by how much.

const DAY = 86_400_000
const isCommitted = (status?: string) =>
  ['booked', 'chosen'].includes((status ?? '').toLowerCase())

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10)
}
function validDay(iso: string | undefined): boolean {
  return !!iso && !Number.isNaN(Date.parse(iso + 'T00:00:00Z'))
}

export interface ShiftReport {
  state: TripState
  /** ids of segments whose arrive+depart both moved */
  shifted: string[]
  /** id of the straddling segment whose depart alone moved (null if none) */
  extended: string | null
  /** ids of transport legs that moved with the plan */
  shiftedTransport: string[]
  /** committed transport legs in the moved window — left untouched on purpose */
  pinnedTransport: TransportLeg[]
  /** booked stays attached to moved segments — their real dates may now disagree with the plan */
  pinnedStays: Stay[]
  /** nights the shifted plan now runs past meta.endDate (0 when it fits or no end date) */
  overrunDays: number
}

/**
 * Shift every remaining in-plan stop by `days` (positive = later), pivoting
 * at `fromDate` (ISO date — typically today). Input state is not mutated.
 * `days === 0` or an invalid pivot returns the state unchanged with an empty
 * report.
 */
export function shiftRemainingStops(state: TripState, fromDate: string, days: number): ShiftReport {
  const empty: ShiftReport = {
    state, shifted: [], extended: null,
    shiftedTransport: [], pinnedTransport: [], pinnedStays: [], overrunDays: 0,
  }
  if (!Number.isInteger(days) || days === 0 || !validDay(fromDate)) return empty

  const shifted: string[] = []
  let extended: string | null = null

  const segments: Segment[] = state.segments.map((s) => {
    if (s.include === false || !validDay(s.arrive) || !validDay(s.depart)) return s
    if (s.arrive >= fromDate) {
      shifted.push(s.id)
      return { ...s, arrive: addDays(s.arrive, days), depart: addDays(s.depart, days) }
    }
    if (s.depart > fromDate) {
      // straddles the pivot: the stop we're currently at gets longer/shorter,
      // but never departs before the pivot itself
      extended = s.id
      const depart = addDays(s.depart, days)
      return { ...s, depart: depart > fromDate ? depart : fromDate }
    }
    return s // already completed — history doesn't move
  })

  const shiftedTransport: string[] = []
  const pinnedTransport: TransportLeg[] = []
  const transport: TransportLeg[] = state.transport.map((t) => {
    if (t.include === false || !validDay(t.date) || (t.date as string) < fromDate) return t
    if (isCommitted(t.status)) {
      pinnedTransport.push(t)
      return t
    }
    shiftedTransport.push(t.id)
    return { ...t, date: addDays(t.date as string, days) }
  })

  const movedSegIds = new Set([...shifted, ...(extended ? [extended] : [])])
  const pinnedStays = state.stays.filter(
    (st) => st.include && movedSegIds.has(st.segId) && isCommitted(st.status),
  )

  let overrunDays = 0
  const end = state.meta.endDate
  if (validDay(end)) {
    const lastDepart = segments
      .filter((s) => s.include !== false && validDay(s.depart))
      .reduce((max, s) => (s.depart > max ? s.depart : max), '')
    if (lastDepart && lastDepart > (end as string)) {
      overrunDays = Math.round((Date.parse(lastDepart + 'T00:00:00Z') - Date.parse(end + 'T00:00:00Z')) / DAY)
    }
  }

  return {
    state: { ...state, segments, transport },
    shifted, extended, shiftedTransport, pinnedTransport, pinnedStays, overrunDays,
  }
}
