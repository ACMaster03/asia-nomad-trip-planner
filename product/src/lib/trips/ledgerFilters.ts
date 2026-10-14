import type { LedgerEntry } from './types'
import { categoryLabel, groupOf, GROUPS, type CategoryGroup } from './categories.ts'
import { toBase } from './format.ts'
import { isEverydayRow } from './spending.ts'

// What All entries shows (the phone's LedgerScreen.swift, round 4b): the
// chip row's filters on top of one another, the search, the split at today,
// the day sections with their totals, and the one-line summary when anything
// is filtered. Pure functions over the ledger, so the page is a thin layer
// and the rules are tested here.
//
// The focus comes from the row that opened the screen: a stop's days from
// Spent so far (from, to), "beyond the everyday here" (the beyond filter over
// those days), Before departure (what was bought before day 1), a category or
// a family from Where it goes, a day from the chart, Coming up from Upcoming.

export type Filter = 'all' | 'everyday' | 'beyond' | 'bookings' | 'subscriptions' | 'income'

export const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'everyday', label: 'Everyday' },
  { id: 'beyond', label: 'Beyond the everyday' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'income', label: 'Income' },
]
export const isFilter = (s: unknown): s is Filter => FILTERS.some((f) => f.id === s)
const isGroup = (s: unknown): s is CategoryGroup => typeof s === 'string' && s in GROUPS

export interface Focus {
  filter: Filter
  /** one category, on top of the filter (Where it goes, or the Category chip) */
  category: string | null
  /** a family of categories, from a row of Where it goes */
  family: CategoryGroup | null
  /** only these days (a stop's, or Where it goes' window) */
  span: { from: string; to: string } | null
  /** only what is dated before this day: departure day, from "Before departure" */
  before: string | null
  /** only the days no stop owns, from Spent so far's "Between stops" (the page says which days those are) */
  between: boolean
  /** the search box's text */
  query: string
}

export const NO_FOCUS: Focus = { filter: 'all', category: null, family: null, span: null, before: null, between: false, query: '' }

/** Anything narrowing the list: the summary line shows then. */
export const isFocused = (f: Focus) =>
  f.filter !== 'all' || !!f.category || !!f.family || !!f.span || !!f.before || f.between || !!f.query.trim()

/** The screen's title: the category or family it opened on, else All entries. */
export const focusTitle = (f: Focus) => (f.category ? categoryLabel(f.category) : f.family ? GROUPS[f.family].label : 'All entries')

/** Accents off, lower case, đ → d (Petra, 24 Sep: "pho" finds "Phở"; the phone's fold). */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').trim()

/** A row the plan wrote for a booking. */
export const isImported = (e: LedgerEntry) => e.source?.kind === 'stay' || e.source?.kind === 'transport'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const validIso = (s: unknown): s is string => typeof s === 'string' && ISO.test(s)

/** The URL's search params as All entries reads them. */
export interface EntriesParams {
  /** opens the list at that day (the chart's "Open in All entries") */
  day?: string
  /** "1": what was bought before departure */
  before?: string
  from?: string
  to?: string
  filter?: string
  /** a category id */
  cat?: string
  /** a family of Where it goes */
  fam?: string
  /** "1": Coming up open */
  coming?: string
  /** "1": the days between stops */
  between?: string
}

/**
 * The focus a link asked for. A family opens on the Everyday filter, as on
 * the phone (Where it goes counts everyday costs only); "before" needs the
 * journey's start date and is nothing without one.
 */
export function focusFromParams(p: EntriesParams, tripStart?: string): { focus: Focus; day: string | null; coming: boolean } {
  const focus: Focus = { ...NO_FOCUS }
  if (isFilter(p.filter)) focus.filter = p.filter
  if (p.cat) focus.category = p.cat
  if (isGroup(p.fam)) {
    focus.family = p.fam
    if (!isFilter(p.filter)) focus.filter = 'everyday'
  }
  if (validIso(p.from) && validIso(p.to) && p.from <= p.to) focus.span = { from: p.from, to: p.to }
  if (p.before === '1' && tripStart) focus.before = tripStart
  if (p.between === '1') focus.between = true
  return { focus, day: validIso(p.day) ? p.day : null, coming: p.coming === '1' }
}

/** The rows the focus keeps, in the ledger's stored order. `isBetween` says whether a day belongs to no stop. */
export function matching(ledger: LedgerEntry[], f: Focus, isBetween?: (date: string) => boolean): LedgerEntry[] {
  const words = fold(f.query).split(/\s+/).filter(Boolean)
  return ledger.filter((e) => {
    if (f.category && e.category !== f.category) return false
    if (f.family && groupOf(e.category) !== f.family) return false
    if (f.span && (e.date < f.span.from || e.date > f.span.to)) return false
    if (f.before && (!e.date || e.date >= f.before)) return false
    if (f.between && !isBetween?.(e.date)) return false
    const expense = e.type !== 'income'
    switch (f.filter) {
      case 'all': break
      case 'everyday': if (!(expense && isEverydayRow(e))) return false; break
      case 'beyond': if (!(expense && !isEverydayRow(e))) return false; break
      case 'bookings': if (!isImported(e)) return false; break
      case 'subscriptions': if (e.category !== 'subscriptions') return false; break
      case 'income': if (e.type !== 'income') return false; break
    }
    if (!words.length) return true
    const hay = fold(`${e.note ?? ''} ${categoryLabel(e.category)}`)
    return words.every((w) => hay.includes(w))
  })
}

/**
 * The rows split at today: what was logged, newest first (and within a day the
 * one added last first, the stored order), and what is dated after today,
 * soonest first (Petra, 23 Sep: scheduled, not spent).
 */
export function splitRows(rows: LedgerEntry[], ledger: LedgerEntry[], todayIso: string): { past: LedgerEntry[]; coming: LedgerEntry[] } {
  const order = new Map(ledger.map((e, i) => [e.id, i]))
  const at = (e: LedgerEntry) => order.get(e.id) ?? 0
  const past = rows.filter((e) => e.date <= todayIso).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : at(b) - at(a)))
  const coming = rows.filter((e) => e.date > todayIso).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : at(a) - at(b)))
  return { past, coming }
}

export interface DaySection {
  date: string
  entries: LedgerEntry[]
  /** what the day's expenses come to, in the base currency */
  spent: number
}

/** Consecutive rows of one day, with the day's spending. `past` as splitRows orders it. */
export function daySections(past: LedgerEntry[], rates: Record<string, number>): DaySection[] {
  const out: DaySection[] = []
  for (const e of past) {
    const last = out[out.length - 1]
    const v = e.type === 'income' ? 0 : toBase(e.amount, e.currency, rates)
    if (last && last.date === e.date) {
      last.entries.push(e)
      last.spent += v
    } else {
      out.push({ date: e.date, entries: [e], spent: v })
    }
  }
  return out
}

/** What the rows' expenses come to, in the base currency. */
export const spentOf = (rows: LedgerEntry[], rates: Record<string, number>) =>
  rows.reduce((a, e) => a + (e.type === 'income' ? 0 : toBase(e.amount, e.currency, rates)), 0)

/** "12 entries · 48 200 Ft spent · 420 000 Ft received" — the line over a filtered list. */
export function summaryLine(past: LedgerEntry[], rates: Record<string, number>, fmt: (n: number) => string): string {
  const got = past.reduce((a, e) => a + (e.type === 'income' ? toBase(e.amount, e.currency, rates) : 0), 0)
  const parts = [`${past.length} ${past.length === 1 ? 'entry' : 'entries'}`, `${fmt(spentOf(past, rates))} spent`]
  if (got > 0) parts.push(`${fmt(got)} received`)
  return parts.join(' · ')
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Tue 14 Oct" */
export function weekdayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** A day section's title: "Today · Tue 14 Oct", "Yesterday · Mon 13 Oct", "Mon 31 Aug · day 1". */
export function dayTitle(date: string, todayIso: string, tripStart?: string): string {
  let title = weekdayLabel(date)
  const diff = (Date.parse(todayIso + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86_400_000
  if (diff === 0) title = `Today · ${title}`
  else if (diff === 1) title = `Yesterday · ${title}`
  if (tripStart && date === tripStart) title += ' · day 1'
  return title
}

/** The categories this journey has used, most used first, then by id. */
export function usedCategories(ledger: LedgerEntry[]): { id: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of ledger) counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
  return [...counts]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * How many day sections to show: whole days, until `rows` rows are on the
 * screen, and at least through `through` (a day a link asked for) so it can be
 * scrolled to.
 */
export function daysToShow(days: DaySection[], rows: number, through: string | null): number {
  let count = 0, n = 0
  for (const d of days) {
    n++
    count += d.entries.length
    if (count >= rows) break
  }
  const idx = through ? days.findIndex((d) => d.date === through) : -1
  return Math.max(n, idx + 1)
}
