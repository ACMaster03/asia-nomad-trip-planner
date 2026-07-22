import type { TripState, CurrencyCode } from './types'

// Seed for trips created through the onboarding wizard (M1 item 6, endframe:
// design/mocks/01-signin-onboarding.html "wizard" state).
//
// This REPLACES makeDefaultState() in the create-trip flow: DEFAULT_STATE is
// the owner's real trip — seeding new trips from it copied real booking
// confirmation numbers into every account (the privacy leak called out in the
// approved plan). New trips start EMPTY, from the basics the wizard collects.
// defaultState.ts stays in the repo purely as the owner's own trip data.

export interface NewTripInput {
  tripName: string
  startDate: string // ISO date
  endDate?: string // ISO date; omit for open-ended trips
  travelers: number
  budgetCap?: number // whole-trip cap in baseCurrency; omit/0 = no cap
  baseCurrency: CurrencyCode // also the trip's primary display currency
  homeBase?: string // wizard step 2, optional
}

// Public FX reference rates (Ft per 1 unit) — same list the owner's trip uses.
// These are just editable starting values (Settings → FX rates); daily refresh
// via pg_cron arrives in M4. Public data, so sharing them leaks nothing.
const STARTER_RATES: Record<CurrencyCode, number> = {
  HUF: 1, USD: 311, EUR: 354, GBP: 415, THB: 9.4, VND: 0.0122, IDR: 0.0191,
  MYR: 70.7, SGD: 230, KHR: 0.078, JPY: 1.94, KRW: 0.207, TWD: 9.76,
  HKD: 39.9, CNY: 45.81, INR: 3.75, NPR: 2.27, LKR: 1.03,
}

export function makeNewTripState(input: NewTripInput): TripState {
  return {
    meta: {
      version: 1,
      tripName: input.tripName.trim(),
      travelers: Math.max(1, Math.round(input.travelers)),
      baseCurrency: input.baseCurrency,
      budgetCap: input.budgetCap && input.budgetCap > 0 ? input.budgetCap : 0,
      startDate: input.startDate,
      ...(input.endDate ? { endDate: input.endDate } : {}),
      ...(input.homeBase?.trim() ? { homeBase: input.homeBase.trim() } : {}),
    },
    rates: { ...STARTER_RATES, [input.baseCurrency]: input.baseCurrency === 'HUF' ? 1 : STARTER_RATES[input.baseCurrency] ?? 1 },
    segments: [],
    stays: [],
    transport: [],
    extras: [],
    notes: {},
  }
}
