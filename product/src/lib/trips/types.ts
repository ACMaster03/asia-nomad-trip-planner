export type CurrencyCode = string

export interface TripMeta {
  version: number
  tripName: string
  travelers: number
  baseCurrency: CurrencyCode
  budgetCap: number
  startDate: string
  endDate?: string // optional — open-ended trips have none (wizard step 1)
  homeBase?: string // e.g. "Budapest, Hungary" (wizard step 2, optional)
  // Currencies the owner removed by hand. Auto-add (from a new country on the
  // route) must never resurrect these — a dismissal outranks the itinerary.
  fxDismissed?: CurrencyCode[]
  // Countries whose "new on your route" banner has already been shown, so it
  // fires once per country rather than on every stop saved there.
  fxSeenCountries?: string[]
  // What the last banner should say. Written in the SAME mutation that adds the
  // currencies, so the message survives a reload and the banner needs no local
  // state; cleared on dismiss.
  fxLastAdded?: { country: string; codes: CurrencyCode[] }
}
export type Tier = 0 | 1 | 2

export interface Segment {
  id: string
  country: string
  city: string
  arrive: string
  depart: string
  nights?: number | null
  tier?: Tier | null
  color?: string
  include?: boolean
  notes?: string
  weather?: string
}
export interface Stay {
  id: string
  segId: string
  name: string
  platform?: string
  url?: string
  cur: CurrencyCode
  ppn: number
  nights?: number | null
  rating?: number
  status?: string
  include?: boolean
  notes?: string
  cancelUntil?: string // ISO date — free-cancellation deadline
  chargeDate?: string // ISO date — when the card is charged
}
export interface TransportLeg {
  id: string
  type: string
  from: string
  to: string
  date?: string
  provider?: string
  url?: string
  cur: CurrencyCode
  price: number
  status?: string
  include?: boolean
  notes?: string
}
export interface Extra {
  id: string
  label: string
  cur: CurrencyCode
  amount: number
  category?: string
  include?: boolean
}
export interface TripState {
  meta: TripMeta
  // The trip's WATCHLIST: keys are the currencies this trip uses (also the
  // currency picker list in Stays/Transport/Extras/Ledger). Values are the last
  // known rate in baseCurrency per 1 unit, refreshed from fx_rates on every load
  // (useTripScreen) and cached here purely so an offline launch still totals.
  // Nobody types them — migration 19.
  rates: Record<CurrencyCode, number>
  segments: Segment[]
  stays: Stay[]
  transport: TransportLeg[]
  extras: Extra[]
  notes: Record<string, string>
  // Ledger auto-import (importCosts.ts). undefined = user never asked yet.
  autoImport?: boolean
  // Source keys ("stay:<id>") the user deleted from the ledger — never re-import.
  importSkip?: string[]
}
export interface LedgerEntry {
  id: string
  date: string
  type: 'income' | 'expense'
  category: string
  amount: number
  currency: CurrencyCode
  note: string
  // Auto-imported rows only (importCosts.ts): the booking this row mirrors.
  source?: { kind: 'stay' | 'transport'; id: string }
  // Booking vanished from the plan — row stays on the books, flagged.
  orphaned?: boolean
}
export type Ledger = LedgerEntry[]

export interface Trip {
  id: string
  owner: string
  name: string
  state: TripState
  ledger: Ledger
  updated_at: string
  created_at: string
  // Revision counters from migration 06 (optimistic-concurrency guards).
  // Optional on purpose: on a pre-migration database the columns don't exist
  // and the write paths fall back to legacy direct updates.
  // TODO(migration-06): make required once 06-security.sql is applied in prod.
  state_rev?: number
  ledger_rev?: number
}
