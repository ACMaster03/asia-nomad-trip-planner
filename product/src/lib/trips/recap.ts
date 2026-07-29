import type { TripState, Ledger, CurrencyCode } from './types'
// explicit .ts so the Node test runner can resolve it too (tsconfig has
// allowImportingTsExtensions; Next's bundler accepts both forms)
import { toBase, segNights } from './format.ts'

// Post-trip recap (M0-gate gap 2). /live and /follow already have their own
// post states; the DASHBOARD is the screen with no phase awareness at all —
// after the flight home it still counts down budget pace as if the trip were
// running. This selector derives the recap the dashboard shows instead.
//
// Phase logic mirrors LiveClient exactly: 'post' means meta.endDate exists
// and today is past it. Open-ended trips never enter 'post' — there is no
// honest "it's over" without an end date, and guessing one from the last
// stop would call a trip done while its owner is still on the road.
//
// Pure selector over state + ledger; money in base currency via the same
// toBase the budget screens use. The dashboard renders it in the UI phase.

export type TripPhase = 'pre' | 'live' | 'post'

export function tripPhase(state: TripState, todayIso: string): TripPhase {
  const { startDate, endDate } = state.meta
  if (startDate && todayIso < startDate) return 'pre'
  if (endDate && todayIso > endDate) return 'post'
  return 'live'
}

export interface CountryRecap {
  country: string
  nights: number
  stops: number
}

export interface TripRecap {
  /** trip length in days, Day 1 = departure day (FIXTURES.md convention) */
  days: number
  stops: number
  countries: CountryRecap[] // ordered by nights, descending
  /** ledger sums in the trip's base currency */
  spent: number
  income: number
  net: number // spent - income (what the trip actually cost)
  budgetCap: number // 0 = no cap was set
  /** negative = over budget by that amount */
  leftOfCap: number | null
  spendByCategory: { category: string; amount: number }[] // expenses only, descending
  checkIns: number // filled by the caller from trip_events if it has them
  baseCurrency: CurrencyCode
}

/**
 * The whole-trip summary for the dashboard's post state. `checkInCount` is
 * optional because events live in their own table, not the document — pass
 * it when the screen already has the feed, omit it otherwise.
 */
export function tripRecap(state: TripState, ledger: Ledger, checkInCount = 0): TripRecap {
  const { meta, rates } = state
  const inPlan = state.segments.filter((s) => s.include !== false)

  const perCountry = new Map<string, CountryRecap>()
  for (const s of inPlan) {
    const c = perCountry.get(s.country) ?? { country: s.country, nights: 0, stops: 0 }
    c.nights += segNights(s)
    c.stops += 1
    perCountry.set(s.country, c)
  }

  let spent = 0
  let income = 0
  const byCat = new Map<string, number>()
  for (const e of ledger) {
    const huf = toBase(e.amount, e.currency, rates)
    if (e.type === 'income') {
      income += huf
    } else {
      spent += huf
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + huf)
    }
  }

  const days = meta.endDate
    ? Math.round((Date.parse(meta.endDate + 'T00:00:00Z') - Date.parse(meta.startDate + 'T00:00:00Z')) / 86_400_000) + 1
    : inPlan.reduce((a, s) => a + segNights(s), 0) + 1

  return {
    days,
    stops: inPlan.length,
    countries: [...perCountry.values()].sort((a, b) => b.nights - a.nights),
    spent,
    income,
    net: spent - income,
    budgetCap: meta.budgetCap,
    leftOfCap: meta.budgetCap > 0 ? meta.budgetCap - (spent - income) : null,
    spendByCategory: [...byCat.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    checkIns: checkInCount,
    baseCurrency: meta.baseCurrency,
  }
}
