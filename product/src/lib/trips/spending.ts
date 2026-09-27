import type { LedgerEntry, Segment, TripState } from './types'
import { toBase, nightsBetween, stayNights, stayTotal } from './format.ts'
import { BOOKING_CATEGORIES, RECURRING_CATEGORY, isEverydayCategory } from './categories.ts'
import { isBookedStatus, isSettled } from './commitment.ts'
import type { PerSeg } from './budget'

// Spending analytics over the ledger — the numbers behind "how much does a day
// here actually cost" (owner note, 2026-09-11: "a daily total spend and charts
// for daily spending by category would be required to see spending habits, so
// better calculations can be made on how much is the rough estimate for a
// city"). Pure functions; everything in base currency via `rates`.

export interface DayTotal {
  date: string
  total: number
  byCategory: Record<string, number>
}

export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const isExpense = (e: LedgerEntry) => e.type === 'expense' && !!e.date

/**
 * Expense totals per calendar day, oldest first. Every day in [from, to] is
 * present (zero days included) so a chart has a continuous axis. Defaults to
 * the ledger's own first/last expense date.
 */
export function dailySpend(
  ledger: LedgerEntry[],
  rates: Record<string, number>,
  opts: { from?: string; to?: string; exclude?: ReadonlySet<string> } = {},
): DayTotal[] {
  const rows = ledger.filter(isExpense).filter((e) => !opts.exclude?.has(e.category))
  if (!rows.length && !(opts.from && opts.to)) return []
  const dates = rows.map((e) => e.date).sort()
  const from = opts.from ?? dates[0]
  const to = opts.to ?? dates[dates.length - 1]
  if (!from || !to || from > to) return []
  const byDate = new Map<string, DayTotal>()
  for (let d = from; d <= to; d = addDays(d, 1)) byDate.set(d, { date: d, total: 0, byCategory: {} })
  for (const e of rows) {
    const day = byDate.get(e.date)
    if (!day) continue // outside the window
    const v = toBase(e.amount, e.currency, rates)
    day.total += v
    day.byCategory[e.category] = (day.byCategory[e.category] ?? 0) + v
  }
  return [...byDate.values()]
}

export interface CategoryTotal {
  category: string
  total: number
  count: number
  /** 0..1 of the window's expense total */
  share: number
}

/** Expense totals by category within an optional date window, largest first. */
export function spendByCategory(
  ledger: LedgerEntry[],
  rates: Record<string, number>,
  opts: { from?: string; to?: string } = {},
): CategoryTotal[] {
  const acc = new Map<string, { total: number; count: number }>()
  let grand = 0
  for (const e of ledger) {
    if (!isExpense(e)) continue
    if (opts.from && e.date < opts.from) continue
    if (opts.to && e.date > opts.to) continue
    const v = toBase(e.amount, e.currency, rates)
    const cur = acc.get(e.category) ?? { total: 0, count: 0 }
    cur.total += v
    cur.count += 1
    acc.set(e.category, cur)
    grand += v
  }
  return [...acc]
    .map(([category, { total, count }]) => ({ category, total, count, share: grand ? total / grand : 0 }))
    .sort((a, b) => b.total - a.total)
}

export interface BurnRate {
  /** days in the window that have passed (inclusive of `to`) */
  days: number
  total: number
  perDay: number
}

/**
 * Observed day-to-day cost: everyday expenses (bookings, subscriptions and
 * fees excluded) divided by the number of days in the window — INCLUDING days
 * with nothing logged, since a quiet day is still a day of the trip.
 */
export function burnRate(
  ledger: LedgerEntry[],
  rates: Record<string, number>,
  from: string,
  to: string,
): BurnRate {
  if (!from || !to || to < from) return { days: 0, total: 0, perDay: 0 }
  const days = nightsBetween(from, to) + 1
  // The same rule as the chart and Where it goes (isEverydayRow): rows the plan
  // wrote are never day-to-day, and an entry's own switch overrides its
  // category. Until #36 this filtered by category alone, so a 90 000 Ft
  // concert ticket in Activities lifted the rate of every night ahead.
  const total = dailySpend(everydayOnly(ledger), rates, { from, to }).reduce((a, d) => a + d.total, 0)
  return { days, total, perDay: days ? total / days : 0 }
}

/** Burn rate for the days already spent at a stop (arrival day → today or departure). */
export function stopBurnRate(seg: Segment, ledger: LedgerEntry[], rates: Record<string, number>, todayIso: string): BurnRate {
  const to = todayIso < seg.depart ? todayIso : seg.depart
  return burnRate(ledger, rates, seg.arrive, to)
}

export interface Pace {
  perDay: number | null
  days: number
  /** where the number comes from: the current stop, the whole trip, or nothing yet */
  scope: 'stop' | 'trip' | 'none'
}

/**
 * The everyday rate the page quotes: the current stop's once it has three
 * days behind it (a city's cost is what matters), else the trip's, else
 * nothing — three days is the floor below which the figure is noise.
 */
export function tripPace(state: TripState, ledger: LedgerEntry[], todayIso: string, current?: Segment | null): Pace {
  if (current && current.arrive <= todayIso) {
    const r = stopBurnRate(current, ledger, state.rates, todayIso)
    if (r.days >= 3) return { perDay: r.perDay, days: r.days, scope: 'stop' }
  }
  const start = state.meta.startDate
  if (start && start <= todayIso) {
    const r = burnRate(ledger, state.rates, start, todayIso)
    if (r.days >= 3) return { perDay: r.perDay, days: r.days, scope: 'trip' }
  }
  return { perDay: null, days: 0, scope: 'none' }
}

export interface StopPlan {
  seg: Segment
  nights: number
  /** nights already slept here (0 for a future stop, `nights` for a past one) */
  nightsIn: number
  /** everyday spend logged between arrival and today/departure */
  spent: number
  stay: number
  /**
   * booked   — chosen/booked and the money is in the ledger
   * unpaid   — chosen/booked, still to pay
   * draft    — ticked, but still an idea/shortlist: a forecast, not a bill
   * estimate — no stay ticked; the catalogue's city average
   * none     — no stay and no catalogue entry for the city
   */
  stayLabel: 'booked' | 'unpaid' | 'draft' | 'estimate' | 'none'
  /** per-night rate used for the nights still ahead */
  rate: number
  rateSrc: 'pace' | 'catalogue'
  remaining: number
  projected: number
}

/**
 * Plan · by stop, honest about time: a stop you are in shows what you have
 * spent there plus the nights left at your pace; a future stop is its stay
 * plus nights × your pace (catalogue rate until you have a pace).
 */
export function planByStop(
  state: TripState,
  ledger: LedgerEntry[],
  perSeg: PerSeg[],
  todayIso: string,
  pace: number | null,
): StopPlan[] {
  const rates = state.rates
  const imported = new Set(ledger.filter((e) => e.source).map((e) => `${e.source!.kind}:${e.source!.id}`))
  return perSeg.map((p) => {
    const seg = p.seg
    const nights = p.nights
    const nightsIn = seg.arrive > todayIso ? 0 : Math.min(nights, nightsBetween(seg.arrive, todayIso) + 1)
    const to = todayIso < seg.depart ? todayIso : seg.depart
    const spent = seg.arrive > todayIso ? 0 : burnRate(ledger, rates, seg.arrive, to).total
    const remaining = Math.max(0, nights - nightsIn)
    const rateSrc = pace !== null ? 'pace' : 'catalogue'
    const rate = pace !== null ? pace : nights ? p.live / nights : 0
    let stayLabel: StopPlan['stayLabel'] = p.accomSrc === 'included' ? 'unpaid' : p.accomSrc
    if (p.accomSrc === 'included') {
      const ticked = state.stays.filter((st) => st.segId === seg.id && st.include)
      const real = ticked.filter((st) => isBookedStatus(st.status))
      // Nothing here is actually booked — the figure is a price someone found,
      // so it forecasts the stop but is never reported as money owed.
      if (!real.length) stayLabel = 'draft'
      // "booked" = the money is in the ledger (auto-imported), which is what
      // lets the Plan rows reconcile with "spent so far"
      else if (ticked.every((st) => imported.has(`stay:${st.id}`))) stayLabel = 'booked'
    }
    return {
      seg, nights, nightsIn, spent, stay: p.accom, stayLabel, rate, rateSrc, remaining,
      projected: p.accom + spent + remaining * rate,
    }
  })
}

export interface BookingRow {
  id: string
  kind: 'stay' | 'transport'
  title: string
  detail: string
  date?: string
  status: 'paid' | 'unpaid' | 'unbooked'
  /** amount in base; 0 for an unbooked leg with no price */
  amount: number
  /** the booking's own currency figure, when it differs from base */
  original?: { amount: number; cur: string }
}

/**
 * Bookings section: every ticked stay and every planned transport leg, with
 * whether the money is already on the books — "paid" once the row is in the
 * ledger (auto-imported from its charge date). A booking whose date has passed
 * but that never got a charge date stays "unpaid" and is flagged in the UI.
 *
 * A row that is ticked but still an idea/shortlist is "unbooked": it is listed
 * (you asked for it in the plan) but counts towards neither `paid` nor `toPay`,
 * because nobody owes money on a draft.
 */
export function bookingsSummary(state: TripState, ledger: LedgerEntry[]) {
  const rates = state.rates
  const base = state.meta.baseCurrency || 'HUF'
  const imported = new Set(ledger.filter((e) => e.source).map((e) => `${e.source!.kind}:${e.source!.id}`))
  const orig = (amount: number, cur: string) => (cur !== base ? { amount, cur } : undefined)
  const stays: BookingRow[] = state.stays
    .filter((st) => st.include)
    .map((st): BookingRow => {
      const seg = state.segments.find((s) => s.id === st.segId)
      const nights = stayNights(st, seg)
      const total = stayTotal(st, seg)
      const booked = isBookedStatus(st.status)
      const paid = booked && imported.has(`stay:${st.id}`)
      return {
        id: st.id, kind: 'stay', title: `${seg?.city ?? '—'} · ${st.name}`,
        detail: `${nights} nights · ${st.ppn} ${st.cur} / night`,
        date: st.chargeDate || undefined,
        status: !booked ? 'unbooked' : paid ? 'paid' : 'unpaid',
        amount: toBase(total, st.cur, rates), original: orig(total, st.cur),
      }
    })
    .sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'))
  const transport: BookingRow[] = state.transport
    .filter((t) => t.include !== false)
    .map((t): BookingRow => {
      const booked = isBookedStatus(t.status)
      const paid = booked && imported.has(`transport:${t.id}`)
      return {
        id: t.id, kind: 'transport', title: `${t.from} → ${t.to}`,
        detail: [t.type, t.provider].filter(Boolean).join(' · '),
        date: t.date || undefined,
        status: !booked ? 'unbooked' : paid ? 'paid' : 'unpaid',
        amount: toBase(t.price, t.cur, rates), original: orig(t.price, t.cur),
      }
    })
    .sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'))
  const all = [...stays, ...transport]
  return {
    stays, transport,
    paid: all.filter((r) => r.status === 'paid').reduce((a, r) => a + r.amount, 0),
    toPay: all.filter((r) => r.status === 'unpaid').reduce((a, r) => a + r.amount, 0),
    // Drafted stays: listed, priced, but owed to nobody. Kept out of
    // paid/toPay and reported separately so the card can say what it is NOT
    // counting. (Drafted transport has always been reported as `unbooked`.)
    draftedStays: stays.filter((r) => r.status === 'unbooked').reduce((a, r) => a + r.amount, 0),
    draftStays: stays.filter((r) => r.status === 'unbooked').length,
    unbooked: transport.filter((r) => r.status === 'unbooked').length,
  }
}

/** Signed day number of `iso` relative to `start` (day 1 = start; the day before is 0, then −1…). */
export const nightsSpan = (start: string, iso: string) =>
  iso >= start ? nightsBetween(start, iso) + 1 : -nightsBetween(iso, start) + 1

/**
 * The categories an entry's own switch can move in or out of the daily average
 * (#36): not stays, transport or subscriptions. The projection adds those on
 * their own (planned stays, legs still to pay, subscriptions ahead), so one
 * counted in the pace as well would be counted twice.
 */
export const everydaySwitchable = (category: string) => !BOOKING_CATEGORIES.has(category) && category !== RECURRING_CATEGORY

/**
 * Everyday = typed by hand, and an everyday category unless the entry says
 * otherwise (#36): a row the plan wrote is a cost of the whole trip, and a
 * one-time ticket in Activities can be left out, gear bought weekly counted in.
 */
export const isEverydayRow = (e: LedgerEntry) =>
  !e.source && (everydaySwitchable(e.category) && e.everyday !== undefined ? e.everyday : isEverydayCategory(e.category))

/** Everyday expenses only — the subset every "per day" figure is built from. */
export const everydayOnly = (ledger: LedgerEntry[]) => ledger.filter(isEverydayRow)

export interface Projection {
  /** expenses dated today or earlier — money that has actually left */
  spent: number
  /**
   * expenses dated after today: a booked stay's charge date, a fare paid on
   * travel day. Real, committed, already in the ledger — but not spent yet, so
   * it is quoted on its own rather than folded into "spent so far".
   */
  scheduled: number
  remainingNights: number
  /** stays for stops whose stay is not paid yet (booked, drafted or estimated) */
  unpaidStays: number
  transportToPay: number
  /** subscription charges falling between tomorrow and the end of the trip (#37) */
  subsAhead: number
  /** spent + scheduled + Σ remaining nights × rate + unpaid stays + transport to pay + subscriptions ahead */
  projected: number
  /** logged spend that no stop or paid booking accounts for: gear, e-SIM, days between stops */
  residual: number
}

/**
 * The projected total, defined so the Plan card's rows add up to it exactly:
 *   Σ stop projections + transport (paid + to pay) + residual + subscriptions ahead
 * = spent + scheduled + Σ remaining × rate + unpaid stays + transport to pay + subsAhead.
 *
 * `todayIso` is what splits spent from scheduled; everything else is timeless.
 *
 * `subsAhead` arrives as a number rather than a subscription list: the window
 * it is counted over (tomorrow → the end of the trip) is decided once, in
 * moneyModel, so the Plan card and the monthly card cannot disagree about it.
 * Subscriptions already charged are in the ledger and reach `spent` like any
 * other row — this term is only the ones still to come.
 */
export function projectFromPlan(
  plan: StopPlan[],
  bookings: ReturnType<typeof bookingsSummary>,
  ledger: LedgerEntry[],
  rates: Record<string, number>,
  todayIso: string,
  subsAhead = 0,
): Projection {
  const expenses = ledger.filter(isExpense)
  const sum = (rows: LedgerEntry[]) => rows.reduce((a, e) => a + toBase(e.amount, e.currency, rates), 0)
  const spent = sum(expenses.filter((e) => isSettled(e.date, todayIso)))
  const scheduled = sum(expenses.filter((e) => !isSettled(e.date, todayIso)))
  const remainingNights = plan.reduce((a, p) => a + p.remaining, 0)
  const ahead = plan.reduce((a, p) => a + p.remaining * p.rate, 0)
  const unpaidStays = plan.filter((p) => p.stayLabel !== 'booked').reduce((a, p) => a + p.stay, 0)
  const transportToPay = bookings.transport.filter((r) => r.status === 'unpaid').reduce((a, r) => a + r.amount, 0)
  const paidStays = bookings.stays.filter((r) => r.status === 'paid').reduce((a, r) => a + r.amount, 0)
  const paidTransport = bookings.transport.filter((r) => r.status === 'paid').reduce((a, r) => a + r.amount, 0)
  const inStops = plan.reduce((a, p) => a + p.spent, 0)
  // Residual is measured against the WHOLE ledger (spent + scheduled): the
  // paid-booking totals it subtracts are timeless too, so mixing bases here
  // would break "Σ stops + transport + residual = projected".
  return {
    spent, scheduled, remainingNights, unpaidStays, transportToPay, subsAhead,
    projected: spent + scheduled + ahead + unpaidStays + transportToPay + subsAhead,
    residual: spent + scheduled - inStops - paidStays - paidTransport,
  }
}

export interface BeyondEveryday {
  /** settled spend that the per-day rate deliberately leaves out */
  total: number
  /**
   * the categories it is made of, biggest first; an entry left out by its own
   * switch is a row of its own, labelled with its name (#36)
   */
  rows: { category: string; amount: number; label?: string }[]
}

/**
 * What the per-day rate is NOT counting (#35). The rate excludes flights,
 * stays, gear, insurance, subscriptions and fees — correctly, since a 372 000
 * flight says nothing about what a day in Bangkok costs — but until now that
 * exclusion happened in silence and nothing on the page admitted to it.
 *
 * Measured as `spent − everyday spent` rather than by summing the non-daily
 * categories, so the figure ties to the rate's own basis by construction: a
 * category that is neither (an unknown id, an income-kind category typed onto
 * an expense row) cannot fall between the two and vanish.
 */
export function beyondEveryday(ledger: LedgerEntry[], rates: Record<string, number>, todayIso: string): BeyondEveryday {
  const settled = ledger.filter((e) => isExpense(e) && isSettled(e.date, todayIso))
  const sum = (rows: LedgerEntry[]) => rows.reduce((a, e) => a + toBase(e.amount, e.currency, rates), 0)
  const by = new Map<string, { category: string; amount: number; label?: string }>()
  for (const e of settled) {
    if (isEverydayRow(e)) continue
    // An everyday category left out by the entry's own switch is named by the
    // entry ("concert tickets"), not as the whole category (#36).
    const own = e.everyday === false && isEverydayCategory(e.category)
    const key = own ? `entry:${e.id}` : e.category
    const row = by.get(key) ?? { category: e.category, amount: 0, ...(own && e.note?.trim() ? { label: e.note.trim() } : {}) }
    row.amount += toBase(e.amount, e.currency, rates)
    by.set(key, row)
  }
  return {
    total: sum(settled) - sum(everydayOnly(settled)),
    rows: [...by.values()].sort((a, b) => b.amount - a.amount),
  }
}

export type OutflowBand = 'stays' | 'living' | 'transport' | 'subs'
export interface MonthOut {
  /** YYYY-MM */
  key: string
  stays: number
  living: number
  transport: number
  subs: number
  total: number
}

/**
 * "To cover the plan" — what has to leave the account each month, built from
 * the SAME terms as projectFromPlan so the two can never drift:
 *
 *   ledger rows (spent + scheduled)  in the month they are dated
 * + the nights still ahead × pace    spread night by night
 * + stays nobody has paid yet        on their charge date
 * + transport booked but unpaid      on its charge date
 * + subscription charges ahead       on each charge date
 * = projection.projected
 *
 * It replaces the pre-trip version (monthlyBuckets, budget.ts), which spread
 * catalogue city averages over the nights and summed to a number invented
 * before departure — the last planning figure left on the page after the
 * pre-trip estimate came off the overview (owner decision, 2026-09-19).
 */
// NOT ON ANY SCREEN since 2026-09-20, when the card that read it was cut, and
// deliberately kept anyway: the test over this function is the tie-out that
// proves projection.projected decomposes into stops, transport, residual and
// subscriptions without losing or double-counting anything, and that total is
// still the headline of the Plan card. Delete the test with it if it ever goes.
export function monthlyOutflow(
  state: TripState,
  plan: StopPlan[],
  bookings: ReturnType<typeof bookingsSummary>,
  ledger: LedgerEntry[],
  subCharges: { date: string; amount: number }[],
  todayIso: string,
): { months: MonthOut[]; total: number } {
  const rates = state.rates
  const M: Record<string, MonthOut> = {}
  const add = (iso: string | undefined, band: OutflowBand, v: number) => {
    if (!iso || !Number.isFinite(v) || v === 0) return
    const key = iso.slice(0, 7)
    const b = (M[key] ??= { key, stays: 0, living: 0, transport: 0, subs: 0, total: 0 })
    b[band] += v
    b.total += v
  }

  // 1) money already on the books, in the month it is dated — settled AND
  //    scheduled, because both are cash that leaves on a known day.
  for (const e of ledger) {
    if (!isExpense(e)) continue
    const band: OutflowBand =
      e.category === 'stays' ? 'stays' : e.category === 'transport' ? 'transport' : e.category === 'subscriptions' ? 'subs' : 'living'
    add(e.date, band, toBase(e.amount, e.currency, rates))
  }
  // 2) the nights still ahead, one night at a time so a stop that straddles a
  //    month split lands in both.
  for (const p of plan) {
    for (let i = 0; i < p.remaining; i++) add(addDays(p.seg.arrive, p.nightsIn + i), 'living', p.rate)
  }
  // 3) stays still to pay, on the charge date if one is set — the earliest,
  //    when a stop has several — and otherwise on arrival.
  for (const p of plan) {
    if (p.stayLabel === 'booked') continue
    const dated = state.stays
      .filter((st) => st.segId === p.seg.id && st.include && st.chargeDate)
      .map((st) => st.chargeDate!)
      .sort()
    add(dated[0] ?? p.seg.arrive, 'stays', p.stay)
  }
  // 4) fares booked but not paid. A leg with no date at all has to land
  //    somewhere to keep the total honest; today is the least wrong month.
  for (const r of bookings.transport) {
    if (r.status !== 'unpaid') continue
    const leg = state.transport.find((t) => t.id === r.id)
    add(leg?.chargeDate || leg?.date || todayIso, 'transport', r.amount)
  }
  // 5) subscriptions still to charge (window fixed by moneyModel)
  for (const c of subCharges) add(c.date, 'subs', c.amount)

  const months = Object.values(M).sort((a, b) => a.key.localeCompare(b.key))
  return { months, total: months.reduce((a, m) => a + m.total, 0) }
}
