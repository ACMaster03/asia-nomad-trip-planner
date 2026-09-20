import type { Segment, TripState } from './types'

// Where the traveller is today, by the plan. Lifted verbatim out of LiveClient
// so the check-in sheet can ask the same question from the layout and get the
// same answer.
//
// The interval is HALF-OPEN: `arrive <= today < depart`. Departure day belongs
// to the next stop, which is why a stop ends the morning you leave it. Note
// that moneyModel.ts uses a CLOSED interval for its own `current`; the two have
// always differed and unifying them is a behaviour change, not a tidy-up, so
// this helper deliberately copies the one the check-in flow already used.

/** Local (device-timezone) YYYY-MM-DD, comparable to the segment date strings. */
export function localISODate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export interface StopsAround {
  inPlan: Segment[]
  curIdx: number
  current: Segment | null
  next: Segment | null
  previous: Segment | null
}

export function stopsAround(state: TripState, todayStr: string): StopsAround {
  const inPlan = state.segments
    .filter((x) => x.include !== false)
    .slice()
    .sort((a, b) => +new Date(a.arrive) - +new Date(b.arrive))
  const curIdx = inPlan.findIndex(
    (seg) => seg.arrive && seg.depart && seg.arrive <= todayStr && todayStr < seg.depart,
  )
  const current = curIdx >= 0 ? inPlan[curIdx] : null
  const next = current
    ? inPlan[curIdx + 1] ?? null
    : inPlan.find((seg) => seg.arrive > todayStr) ?? null
  const previous = current
    ? null
    : [...inPlan].reverse().find((seg) => seg.depart <= todayStr) ?? null
  return { inPlan, curIdx, current, next, previous }
}

/**
 * City scope for the check-in place list: the current stop; in a gap you are
 * most likely still around the previous stop, else early at the next one.
 */
export function checkInCity(state: TripState, todayStr: string): string | null {
  const { current, previous, next } = stopsAround(state, todayStr)
  return current?.city ?? previous?.city ?? next?.city ?? null
}
