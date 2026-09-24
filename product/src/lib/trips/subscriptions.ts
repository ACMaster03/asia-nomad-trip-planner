import type { Subscription } from './types'
import { toBase } from './format.ts'

// Subscriptions (#37) — the recurring costs from home.
//
// THE RULE: the schedule is declared (anchor date + everyMonths), never
// inferred from ledger history. Prediction is then arithmetic rather than
// guesswork, and a charge logged three days late cannot drag the whole series
// with it. Ledger rows under the `subscriptions` category confirm occurrences;
// they never define them.
//
// The series runs FORWARD from the anchor only. Asking about a date before it
// gives the anchor itself, never an invented earlier occurrence: what the trip
// already paid is the ledger's record, and predicting backwards over it would
// be the same guesswork the declared cadence exists to avoid.
//
// Nothing here is stored. Next charge is derived the way reminders.ts derives
// money deadlines from the stays — edit the subscription and every date moves
// with it. Dates are plain ISO strings and the month walk is pure arithmetic:
// no Date parsing, so no timezone can shift a charge across midnight.

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const parse = (iso: string) => ({ y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10) })
/** Day 0 of the next month is the last day of this one. */
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const validIso = (iso?: string | null): iso is string => !!iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)

/**
 * The anchor shifted by `k` months, with the day CLAMPED to the target month.
 * Always measured from the anchor, never from the previous occurrence, so a
 * 31st anchor gives 28 Feb and then 31 Mar — the clamp never becomes sticky.
 */
export function shiftMonths(anchor: string, k: number): string {
  const { y, m, d } = parse(anchor)
  const total = y * 12 + (m - 1) + k
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return isoOf(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

export const everyMonthsOf = (sub: Subscription) => Math.max(1, Math.round(Number(sub.everyMonths) || 1))

/** Cancelled subscriptions keep their history; they just stop predicting. */
export const isCancelled = (sub: Subscription) => validIso(sub.cancelledOn)

/**
 * The first charge falling on or after `fromIso`, or null when there is none:
 * the subscription was cancelled before it, or the anchor is unusable.
 * A charge exactly ON the cancellation date is already cancelled — you stopped
 * it that day — so occurrences must fall strictly before `cancelledOn`.
 */
export function nextCharge(sub: Subscription, fromIso: string): string | null {
  if (!validIso(sub.anchor) || !validIso(fromIso)) return null
  const every = everyMonthsOf(sub)
  const a = parse(sub.anchor)
  const f = parse(fromIso)
  const months = (f.y - a.y) * 12 + (f.m - a.m)
  let k = Math.max(0, Math.floor(months / every))
  // Day-of-month and clamping can leave us one period short or long; two steps
  // is always enough to land on the first occurrence >= fromIso.
  for (let i = 0; i < 4; i++, k++) {
    const at = shiftMonths(sub.anchor, k * every)
    if (at < fromIso) continue
    if (validIso(sub.cancelledOn) && at >= sub.cancelledOn) return null
    return at
  }
  return null
}

/** Every charge in [fromIso, toIso], inclusive. Empty once cancelled. */
// ---- the question on the entry form (mock 16 §7, round 3) -----------------

const nameKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** The live subscription an entry's name belongs to, if one is called that. */
export function subNamed(subs: Subscription[], name: string): Subscription | null {
  const key = nameKey(name)
  if (!key) return null
  return subs.find((s) => !isCancelled(s) && nameKey(s.label) === key) ?? null
}

/**
 * The scheduled charge of `sub` nearest to `dateIso`, within `withinDays`: the
 * one an entry on that date most likely is ("its 14 Oct charge?").
 */
export function nearestCharge(sub: Subscription, dateIso: string, withinDays = 20): string | null {
  if (!validIso(dateIso)) return null
  const t = Date.parse(dateIso)
  const day = 86_400_000
  const from = new Date(t - (withinDays + 1) * day).toISOString().slice(0, 10)
  const to = new Date(t + (withinDays + 1) * day).toISOString().slice(0, 10)
  let best: string | null = null
  for (const at of chargesBetween(sub, from, to)) {
    const d = Math.abs(Date.parse(at) - t) / day
    if (d <= withinDays && (!best || d < Math.abs(Date.parse(best) - t) / day)) best = at
  }
  return best
}

/**
 * The subscription an entry declares when its form says it repeats: the
 * charge is the subscription (#59), so the schedule hangs off the entry's date
 * and nothing else is asked.
 */
export function subFromEntry(
  entry: { label: string; amount: number; cur: string; date: string },
  everyMonths: number,
  remind: boolean,
  id: string,
): Subscription {
  return {
    id,
    label: entry.label.trim() || 'Subscription',
    cur: entry.cur,
    amount: entry.amount,
    everyMonths: Math.max(1, Math.round(everyMonths) || 1),
    anchor: entry.date,
    ...(remind ? { remind: true, leadDays: 3 } : { remind: false }),
  }
}

/** A ledger row, as far as the subscription it may be a charge of goes. */
export type LoggedCharge = { subId?: string | null; date: string }

/**
 * Where to look for a subscription's next charge from: today, or the day after
 * its latest logged charge when that is today or later. A subscription
 * declared from today's entry has already charged today; without this, the
 * card called that charge "today" in amber, as if it were still to come.
 */
export function nextChargeFrom(sub: Subscription, todayIso: string, ledger: LoggedCharge[]): string {
  let last = ''
  for (const e of ledger) if (e.subId === sub.id && e.date > last) last = e.date
  if (last < todayIso) return todayIso
  const [y, m, d] = last.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/**
 * The live subscription that charges soonest, today included, within `days`
 * days: what a folded Subscriptions line still has to show, so a charge due
 * this week is never behind a tap (Money, 24 Sep).
 */
export function chargeSoon(
  subs: Subscription[], todayIso: string, days = 7, ledger: LoggedCharge[] = [],
): { sub: Subscription; inDays: number } | null {
  let best: { sub: Subscription; inDays: number } | null = null
  for (const sub of subs) {
    const next = nextCharge(sub, nextChargeFrom(sub, todayIso, ledger))
    if (!next) continue
    const inDays = Math.round((Date.parse(next) - Date.parse(todayIso)) / 86_400_000)
    if (inDays > days) continue
    if (!best || inDays < best.inDays) best = { sub, inDays }
  }
  return best
}

export function chargesBetween(sub: Subscription, fromIso: string, toIso: string): string[] {
  const out: string[] = []
  if (!validIso(fromIso) || !validIso(toIso) || toIso < fromIso) return out
  const every = everyMonthsOf(sub)
  let at = nextCharge(sub, fromIso)
  // A yearly subscription over a two-year trip is 2 rows; the cap is only here
  // so a corrupt everyMonths can never spin.
  for (let i = 0; at && at <= toIso && i < 600; i++) {
    out.push(at)
    const after = shiftMonths(at, every)
    at = nextCharge(sub, after)
  }
  return out
}

/** What one subscription costs per month, amortised — a yearly plan / 12. */
export const monthlyRate = (sub: Subscription) => (Number(sub.amount) || 0) / everyMonthsOf(sub)

/** Active = not cancelled. Amortised run-rate in base currency. */
export function monthlyRunRate(subs: Subscription[], rates: Record<string, number>): number {
  return subs
    .filter((s) => !isCancelled(s))
    .reduce((a, s) => a + toBase(monthlyRate(s), s.cur, rates), 0)
}

/**
 * What the subscriptions will take between two dates, in base currency —
 * counted charge by charge, not by amortising the run-rate over the window, so
 * a yearly renewal that falls outside the trip costs the trip nothing.
 */
export function subsBetween(subs: Subscription[], rates: Record<string, number>, fromIso: string, toIso: string): number {
  return subs.reduce(
    (a, s) => a + chargesBetween(s, fromIso, toIso).length * toBase(Number(s.amount) || 0, s.cur, rates),
    0,
  )
}

/** Every charge in the window, flattened and dated — what the monthly card buckets. */
export function subsCharges(subs: Subscription[], rates: Record<string, number>, fromIso: string, toIso: string) {
  const out: { sub: Subscription; date: string; amount: number }[] = []
  for (const sub of subs) {
    const amount = toBase(Number(sub.amount) || 0, sub.cur, rates)
    for (const date of chargesBetween(sub, fromIso, toIso)) out.push({ sub, date, amount })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

const ORDINALS = ['th', 'st', 'nd', 'rd']
/** "the 23rd" — the day a monthly subscription hangs off. */
export function ordinalDay(iso: string): string {
  const d = parse(iso).d
  const v = d % 100
  return `the ${d}${ORDINALS[(v - 20) % 10] ?? ORDINALS[v] ?? ORDINALS[0]}`
}

export function cadenceLabel(sub: Subscription): string {
  const every = everyMonthsOf(sub)
  if (every === 1) return 'monthly'
  if (every === 12) return 'yearly'
  return `every ${every} months`
}

/** "monthly · the 23rd" / "yearly · next 12 Nov" — what the row says under the name. */
export function scheduleLabel(sub: Subscription, todayIso: string): string {
  const every = everyMonthsOf(sub)
  const next = nextCharge(sub, todayIso)
  if (every === 1) return `monthly · ${ordinalDay(sub.anchor)}`
  return `${cadenceLabel(sub)}${next ? ` · next ${shortDate(next)}` : ''}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "12 Nov" — same shape as reminders.ts, built without a Date parse. */
export function shortDate(iso: string): string {
  const { m, d } = parse(iso)
  return `${d} ${MONTHS[m - 1] ?? '?'}`
}

export const LEAD_CHOICES = [1, 3, 7] as const
export const leadLabel = (days: number) => `${days} day${days === 1 ? '' : 's'} before`
