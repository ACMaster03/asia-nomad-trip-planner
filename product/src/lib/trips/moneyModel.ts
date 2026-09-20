import type { LedgerEntry, Segment, TripState } from './types'
import { computeBudget, type CityCost } from './budget'
import {
  addDays, beyondEveryday, bookingsSummary, monthlyActuals, monthlyOutflow, monthlyToEarn, planByStop, projectFromPlan, tripPace,
} from './spending'
import { subsCharges } from './subscriptions'

// Everything the Money page and Home's money card need, derived once from the
// trip document. Kept out of spending.ts because computeBudget pulls in the
// catalogue helpers (path alias) that the node tests cannot resolve.
export function moneyModel(state: TripState, ledger: LedgerEntry[], cityIdx: Record<string, CityCost>, todayIso: string) {
  const budget = computeBudget(state, cityIdx)
  const inPlan = state.segments.filter((s) => s.include !== false).slice().sort((a, b) => a.arrive.localeCompare(b.arrive))
  const current: Segment | null = inPlan.find((s) => s.arrive <= todayIso && todayIso <= s.depart) ?? null
  const pace = tripPace(state, ledger, todayIso, current)
  const plan = planByStop(state, ledger, budget.perSeg, todayIso, pace.perDay)
  const bookings = bookingsSummary(state, ledger)

  // Subscriptions still to come (#37). The window is decided HERE, once, and
  // handed to everything downstream — the projection, the Plan card's row and
  // the monthly bars all count the same charges or none of them.
  //
  // It opens TOMORROW, not today: a charge dated today is either already in the
  // ledger (and so in `spent`) or was missed, and counting it here as well
  // would double it. The same cut `isSettled` makes everywhere else.
  const subs = state.subscriptions ?? []
  const tripEnd = state.meta.endDate || inPlan.reduce((m, s) => (s.depart > m ? s.depart : m), '')
  const subCharges = tripEnd ? subsCharges(subs, state.rates, addDays(todayIso, 1), tripEnd) : []
  const subsAhead = subCharges.reduce((a, c) => a + c.amount, 0)

  const projection = projectFromPlan(plan, bookings, ledger, state.rates, todayIso, subsAhead)
  const monthly = monthlyOutflow(state, plan, bookings, ledger, subCharges, todayIso)
  // What actually happened, month by month. Not shown on its own any more; it
  // is here because toEarn needs it to net the current month against spending
  // that has already left it.
  const actuals = monthlyActuals(ledger, state.rates, todayIso)
  const toEarn = monthlyToEarn(monthly.months, actuals.months, todayIso)
  const beyond = beyondEveryday(ledger, state.rates, todayIso)
  return { budget, inPlan, current, pace, plan, bookings, projection, subs, subCharges, monthly, actuals, toEarn, beyond, tripEnd }
}
export type MoneyModel = ReturnType<typeof moneyModel>
