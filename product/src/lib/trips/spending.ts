import type { LedgerEntry, Segment, TripState } from './types'
import { toBase, nightsBetween, stayNights, stayTotal } from './format.ts'
import { NON_DAILY_CATEGORIES, isEverydayCategory } from './categories.ts'
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
  exclude: ReadonlySet<string> = NON_DAILY_CATEGORIES,
): BurnRate {
  if (!from || !to || to < from) return { days: 0, total: 0, perDay: 0 }
  const days = nightsBetween(from, to) + 1
  const total = dailySpend(ledger, rates, { from, to, exclude }).reduce((a, d) => a + d.total, 0)
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
  stayLabel: 'booked' | 'unpaid' | 'estimate' | 'none'
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
      const chosen = state.stays.filter((st) => st.segId === seg.id && st.include)
      // "booked" = the money is in the ledger (auto-imported), which is what
      // lets the Plan rows reconcile with "spent so far"
      if (chosen.length && chosen.every((st) => imported.has(`stay:${st.id}`))) stayLabel = 'booked'
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
 * Bookings section: every chosen stay and every planned transport leg, with
 * whether the money is already on the books — "paid" once the row is in the
 * ledger (auto-imported from its charge date). A booking whose date has passed
 * but that never got a charge date stays "unpaid" and is flagged in the UI.
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
      const paid = imported.has(`stay:${st.id}`)
      return {
        id: st.id, kind: 'stay', title: `${seg?.city ?? '—'} · ${st.name}`,
        detail: `${nights} nights · ${st.ppn} ${st.cur} / night`,
        date: st.chargeDate || undefined,
        status: paid ? 'paid' : 'unpaid',
        amount: toBase(total, st.cur, rates), original: orig(total, st.cur),
      }
    })
    .sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'))
  const isBooked = (status?: string) => ['booked', 'chosen'].includes((status ?? '').toLowerCase())
  const transport: BookingRow[] = state.transport
    .filter((t) => t.include !== false)
    .map((t): BookingRow => {
      const booked = isBooked(t.status)
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
    unbooked: transport.filter((r) => r.status === 'unbooked').length,
  }
}

/** Signed day number of `iso` relative to `start` (day 1 = start; the day before is 0, then −1…). */
export const nightsSpan = (start: string, iso: string) =>
  iso >= start ? nightsBetween(start, iso) + 1 : -nightsBetween(iso, start) + 1

/** Everyday expenses only — the subset every "per day" figure is built from. */
export const everydayOnly = (ledger: LedgerEntry[]) => ledger.filter((e) => isEverydayCategory(e.category))

export interface Projection {
  /** every expense logged so far */
  spent: number
  remainingNights: number
  /** stays for stops whose chosen stay is not paid yet (or only estimated) */
  unpaidStays: number
  transportToPay: number
  /** spent + Σ remaining nights × rate + unpaid stays + transport to pay */
  projected: number
  /** spent that no stop or paid booking accounts for: gear, e-SIM, days between stops */
  residual: number
}

/**
 * The projected total, defined so the Plan card's rows add up to it exactly:
 *   Σ stop projections + transport (paid + to pay) + residual
 * = spent so far + Σ remaining × rate + unpaid stays + transport to pay.
 */
export function projectFromPlan(
  plan: StopPlan[],
  bookings: ReturnType<typeof bookingsSummary>,
  ledger: LedgerEntry[],
  rates: Record<string, number>,
): Projection {
  const spent = ledger.filter(isExpense).reduce((a, e) => a + toBase(e.amount, e.currency, rates), 0)
  const remainingNights = plan.reduce((a, p) => a + p.remaining, 0)
  const ahead = plan.reduce((a, p) => a + p.remaining * p.rate, 0)
  const unpaidStays = plan.filter((p) => p.stayLabel !== 'booked').reduce((a, p) => a + p.stay, 0)
  const transportToPay = bookings.transport.filter((r) => r.status === 'unpaid').reduce((a, r) => a + r.amount, 0)
  const paidStays = bookings.stays.filter((r) => r.status === 'paid').reduce((a, r) => a + r.amount, 0)
  const paidTransport = bookings.transport.filter((r) => r.status === 'paid').reduce((a, r) => a + r.amount, 0)
  const inStops = plan.reduce((a, p) => a + p.spent, 0)
  return {
    spent, remainingNights, unpaidStays, transportToPay,
    projected: spent + ahead + unpaidStays + transportToPay,
    residual: spent - inStops - paidStays - paidTransport,
  }
}
