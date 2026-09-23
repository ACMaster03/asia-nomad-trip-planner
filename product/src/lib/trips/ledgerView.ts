import type { LedgerEntry } from './types'
import { toBase } from './format.ts'

// What All entries lists, split at today (Petra, 23 Sep). A row dated
// after today is scheduled, not spent: a booked stay charged next week, a fare
// still to be taken. Those used to sit at the top, above a "Today" band, so the
// list opened on something nobody had logged, and the month total above them
// counted them while the box beside it said "not counted as spent". Now they
// fold into one line at the top, and no month or day total counts them.

export interface LedgerView {
  /** dated after today, soonest first */
  scheduled: LedgerEntry[]
  /** what the scheduled rows will cost; null when an income is among them */
  scheduledSpend: number | null
  /** today and before, newest first */
  past: LedgerEntry[]
  /** spending per month and per day, in the base currency, past rows only */
  byMonth: Record<string, number>
  byDay: Record<string, number>
  /** spending logged before the trip starts */
  preCount: number
  preTotal: number
}

export function ledgerView(
  entries: LedgerEntry[],
  rates: Record<string, number>,
  todayIso: string,
  tripStart?: string,
): LedgerView {
  const newestFirst = entries.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const past = newestFirst.filter((e) => e.date <= todayIso)
  const scheduled = newestFirst.filter((e) => e.date > todayIso).reverse()
  const byMonth: Record<string, number> = {}
  const byDay: Record<string, number> = {}
  let preCount = 0, preTotal = 0
  for (const e of past) {
    if (e.type !== 'expense') continue
    const v = toBase(e.amount, e.currency, rates)
    byMonth[e.date.slice(0, 7)] = (byMonth[e.date.slice(0, 7)] ?? 0) + v
    byDay[e.date] = (byDay[e.date] ?? 0) + v
    if (tripStart && e.date < tripStart) { preCount++; preTotal += v }
  }
  const scheduledSpend = scheduled.every((e) => e.type === 'expense')
    ? scheduled.reduce((a, e) => a + toBase(e.amount, e.currency, rates), 0)
    : null
  return { scheduled, scheduledSpend, past, byMonth, byDay, preCount, preTotal }
}
