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
  // Timeline build (2026-09-22, mock 15 §5, #58/#60). All optional and
  // migration-free: a stay written before it simply spans its stop, as it
  // always did, and its deadlines read as "never asked".
  checkIn?: string // ISO date — the stay's own nights, so a stop can hold several stays
  checkOut?: string // ISO date, exclusive: the morning you leave
  noFreeCancel?: boolean // the explicit "No free cancellation" answer; blank cancelUntil without it = still to enter
  chargeAtCheckIn?: boolean // the explicit "At check-in" answer; chargeDate mirrors checkIn so the import and the reminders need no new branch
  remind?: boolean // the deadline reminder switch; absent = on (the derived reminder always existed), false = off
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
  // ISO date — when the fare was actually charged, if that is not the travel
  // date. Fares are usually paid at booking, months ahead; without this the
  // Money page reads a booked-and-paid flight as money still to come.
  chargeDate?: string
  // Timeline build (mock 15 §6): from, to and date are the leg's, taken from
  // the stops on either side. These are the only other things typed.
  time?: string // HH:MM departure, optional
  via?: string // a connection, a place you pass through: no nights, no budget, no check-in (#58)
  hours?: number // total travel time when known, shown beside the via
}
// A recurring cost from home (issue #37). The cadence is DECLARED, never
// inferred from ledger history: two rows 31 days apart could be monthly or two
// instalments of a yearly plan, a row logged three days late shifts the whole
// prediction, and a price change reads as a different subscription. Anchor +
// everyMonths makes the next charge arithmetic; ledger rows under the
// `subscriptions` category only CONFIRM an occurrence (and can flag drift).
//
// Deliberately NOT a ledger entry: a predicted charge is a forecast, and
// writing it to the ledger would double-count against projection.spent and
// pollute the daily chart. This is the recurring sibling of Extra, and it lives
// beside the plan for the same reason UserReminder does.
export interface Subscription {
  id: string
  label: string
  cur: CurrencyCode
  amount: number
  /** 1 = monthly, 3 / 6 = every N months, 12 = yearly */
  everyMonths: number
  /** ISO date of a known charge — the schedule hangs off its day of the month */
  anchor: string
  /** remind before it charges — off by default; most of them you never want told about */
  remind?: boolean
  /** days before the charge (1 / 3 / 7), mirroring the stay-deadline offsets */
  leadDays?: number
  /**
   * ISO date it was cancelled. A STATE, never a delete: prediction and
   * reminders stop here, and every charge before it stays in history and in
   * every total it already fed.
   */
  cancelledOn?: string | null
  /**
   * The first date whose charge the app writes into the ledger by itself
   * (Patrik, 24 Sep, #37). Set on every subscription declared since; unset on
   * older ones, which start at SUB_CHARGES_FROM (importCosts.ts), so the
   * months already logged by hand are never written again.
   */
  autoFrom?: string
}
export interface Extra {
  id: string
  label: string
  cur: CurrencyCode
  amount: number
  /** the extras form's own word (Visa, Insurance, …); lib/trips/extras.ts maps it onto a ledger id */
  category?: string
  include?: boolean
  // ISO date the card was hit. Set, the import writes the payment into the
  // ledger itself (importCosts.ts, 2026-09-23); cleared, that row goes again.
  // Blank = planned, not paid yet. Optional and migration-free.
  paidOn?: string
}
// A reminder the user typed (handoff frames 25–26). Lives on the state JSON —
// optional and migration-free, like autoImport/importSkip. Money deadlines
// (free-cancel / card-charged) are NOT stored: reminders.ts derives them from
// the stays, so editing the stay moves the deadline with it.
export interface UserReminder {
  id: string
  title: string
  due?: string | null // ISO date — optional; undated reminders never show on Home
  doneOn?: string | null // ISO date it was ticked; null/absent = still open
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
  // Money's cards that wait for data (mock 16 §6, lib/trips/unlocks.ts): the
  // day each first qualified on this journey, so it never disappears again as
  // entries are edited. Optional and migration-free, like everything here.
  moneyUnlocked?: Partial<Record<'chart' | 'range' | 'where' | 'projection', string>>
  // User reminders (frames 25–26). Optional — older documents simply lack it.
  reminders?: UserReminder[]
  // Recurring costs from home (#37). Optional and migration-free, like
  // reminders: a document written before this feature simply has none.
  subscriptions?: Subscription[]
}
export interface LedgerEntry {
  id: string
  date: string
  type: 'income' | 'expense'
  category: string
  amount: number
  currency: CurrencyCode
  note: string
  // Auto-imported rows only (importCosts.ts): the booking this row mirrors, or
  // for kind 'sub' the subscription charge it is ("<subId>@<date>").
  source?: { kind: 'stay' | 'transport' | 'extra' | 'sub'; id: string }
  // Booking vanished from the plan — row stays on the books, flagged.
  orphaned?: boolean
  /**
   * A charge in the Subscriptions category (mock 16 §7, round 3): the id of the
   * subscription it is a charge of, or null once someone said it does not
   * repeat. Unset: never asked (typed before round 3, or not a subscription).
   */
  subId?: string | null
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
  // Required since the 2026-07-29 cleanup: 06 is applied to prod and staging,
  // the columns default to 0, and the legacy fallback writes are gone.
  state_rev: number
  ledger_rev: number
}
