import type { LedgerEntry, Segment, TripState } from './types'
import { computeBudget, type CityCost } from './budget'
import { tripPace, planByStop, bookingsSummary, projectFromPlan } from './spending'

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
  const projection = projectFromPlan(plan, bookings, ledger, state.rates, todayIso)
  return { budget, inPlan, current, pace, plan, bookings, projection }
}
export type MoneyModel = ReturnType<typeof moneyModel>
