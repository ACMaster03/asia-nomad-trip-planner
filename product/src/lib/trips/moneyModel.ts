import type { LedgerEntry, Segment, TripState } from './types'
import { computeBudget, type CityCost } from './budget'
import { nightsBetween } from './format'
import { tripDay } from './progress'
import {
  addDays, beyondEveryday, bookingsSummary, planByStop, projectFromPlan, tripPace,
} from './spending'
import { spentByPlace, upcomingCharges } from './moneyRows'
import { subsCharges } from './subscriptions'

// Everything the Money page and Home's money card need, derived once from the
// trip document. Kept out of spending.ts because computeBudget pulls in the
// catalogue helpers (path alias) that the node tests cannot resolve.
export function moneyModel(state: TripState, ledger: LedgerEntry[], cityIdx: Record<string, CityCost>, todayIso: string) {
  const budget = computeBudget(state, cityIdx)
  const inPlan = state.segments.filter((s) => s.include !== false).slice().sort((a, b) => a.arrive.localeCompare(b.arrive))
  const current = currentStop(state, todayIso)
  const pace = tripPace(state, ledger, todayIso, current)
  const plan = planByStop(state, ledger, budget.perSeg, todayIso, pace.perDay)
  const bookings = bookingsSummary(state, ledger, todayIso)
  const tripStart = state.meta.startDate || undefined
  /** Before departure (#149): an estimate for the planned nights, no daily charts. */
  const beforeDeparture = !!tripStart && todayIso < tripStart
  /** where the planned stops end */
  const planEnd = inPlan.reduce((m, s) => (s.depart > m ? s.depart : m), '') || undefined

  // Subscriptions still to come (#37). The window is decided HERE, once, and
  // handed to everything downstream — the projection, the Plan card's row and
  // the monthly bars all count the same charges or none of them.
  //
  // It opens TOMORROW, not today: a charge dated today is either already in the
  // ledger (and so in `spent`) or was missed, and counting it here as well
  // would double it. The same cut `isSettled` makes everywhere else.
  const subs = state.subscriptions ?? []
  const tripEnd = state.meta.endDate || planEnd || ''
  // Before departure the subscriptions are counted to the plan's end, as the phone does (#149).
  const subsTo = beforeDeparture ? planEnd : tripEnd
  const subCharges = subsTo ? subsCharges(subs, state.rates, addDays(todayIso, 1), subsTo) : []
  const subsAhead = subCharges.reduce((a, c) => a + c.amount, 0)

  // The days no stop covers yet (#127): everyday at the pace (the plan's own
  // rate before there is one), and a night at what the planned stays average.
  // Before departure they are counted but not priced (#149 Q6).
  const plannedNights = plan.reduce((a, p) => a + p.nights, 0)
  let unplannedDays = 0
  if (tripEnd) {
    const from = [planEnd ?? todayIso, todayIso].sort().pop()!
    if (tripEnd > from) unplannedDays = nightsBetween(from, tripEnd)
  }
  const dayRate = pace.perDay ?? (plannedNights > 0 ? plan.reduce((a, p) => a + p.rate * p.nights, 0) / plannedNights : 0)
  const stayed = plan.filter((p) => p.stay > 0 && p.nights > 0)
  const stayNights = stayed.reduce((a, p) => a + p.nights, 0)
  const nightRate = stayNights > 0 ? stayed.reduce((a, p) => a + p.stay, 0) / stayNights : 0
  const unplanned = { days: unplannedDays, amount: beforeDeparture ? 0 : unplannedDays * (dayRate + nightRate) }

  const projection = projectFromPlan(plan, bookings, ledger, state.rates, todayIso, subsAhead, unplanned)
  // No monthly breakdown here any more. The card that read one was cut
  // (2026-09-20) and monthlyOutflow went unwired with it — it is still
  // exported and still tested, because its test is the tie-out proving
  // projection.projected decomposes without losing or double-counting a
  // forint, and that figure is very much still on screen.
  const beyond = beyondEveryday(ledger, state.rates, todayIso)
  const upcoming = upcomingCharges(state, ledger, bookings, state.rates, todayIso)
  const spentParts = spentByPlace(state, ledger, state.rates, todayIso, current)
  const currentPlan = current ? plan.find((p) => p.seg.id === current.id) ?? null : null
  /** transport legs on the plan that aren't booked: counted in no figure */
  const unbookedLegs = state.transport.filter((t) => bookings.transport.some((r) => r.id === t.id && r.status === 'unbooked'))
  const cap = (state.meta.budgetCap ?? 0) > 0 ? state.meta.budgetCap! : null
  return {
    state, ledger, rates: state.rates, cap, tripDay: tripDay(state.meta, todayIso),
    budget, inPlan, current, currentPlan, pace, plan, bookings, projection, subs, subCharges, beyond, tripStart, tripEnd, planEnd,
    beforeDeparture, upcoming, spentParts, unbookedLegs,
  }
}
export type MoneyModel = ReturnType<typeof moneyModel>

/** The stop that contains today, in plan order: none before departure and between stops. */
export function currentStop(state: TripState, todayIso: string): Segment | null {
  return state.segments
    .filter((s) => s.include !== false)
    .sort((a, b) => a.arrive.localeCompare(b.arrive))
    .find((s) => s.arrive <= todayIso && todayIso <= s.depart) ?? null
}
