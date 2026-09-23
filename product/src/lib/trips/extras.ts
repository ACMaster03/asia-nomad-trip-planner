import type { Extra, LedgerEntry, TripState } from './types'
import { foldCategory, normalizeCategory, ONE_OFF_CATEGORIES } from './categories.ts'
import { toBase } from './format.ts'
import { isSettled } from './commitment.ts'

// === One-offs & extras ===
//
// The extras form speaks in its own seven words (Visa, Insurance, Vaccines,
// Gear, Flights (intl), SIM/eSIM, Other) and stores them as typed, while the
// ledger stores registry ids (lib/trips/categories.ts). Until 2026-09-23 the
// two never met: the One-offs card keyed its Planned column by the extra's
// word and its Paid column by the ledger id, so "Insurance" and "insurance"
// were two rows. This is the one bridge, used by BOTH sides of that card and
// by the import that writes an extra's payment row, so they can never
// disagree again.
//
// Three of the seven words have no alias in the registry; they are mapped
// here rather than by adding aliases, because categories.test.ts pins the
// registry to migrations 31 + 32 and a vaccine is a health cost, not a
// category of its own.
const EXTRA_WORDS: Record<string, string> = {
  vaccines: 'health',
  vaccine: 'health',
  'flights (intl)': 'transport',
  'sim/esim': 'connectivity',
}

/** Registry id for an extra's category; unknown words fall back to `other`. */
export function extraCategoryId(raw: string | undefined | null): string {
  const folded = foldCategory(raw ?? '')
  if (!folded) return 'other'
  const mapped = EXTRA_WORDS[folded]
  if (mapped) return mapped
  const n = normalizeCategory(folded)
  return n.known ? n.id : 'other'
}

/** A paid-on date makes the extra a payment; the tick is only about the forecast. */
export const isPaidExtra = (e: Extra): boolean => !!e.paidOn && e.amount > 0

// ---- the One-offs card on Money ---------------------------------------------
//
// Grouped by category, because a payment typed on Money can only be joined to
// the plan by its category. Under each heading, EVERY extra of that category
// is listed by name with where it stands, and the payments typed on Money make
// one line of their own. Petra on the phone, 23 Sep, after #74: "the e-visas
// entry is not there". It was: insurance and visas are one category, the
// heading carried both sums and a single line naming the latest payment, and
// the phone cut the heading to "Insurance & …". Counted, but not listed.

export interface OneOffItem {
  id: string
  label: string
  /** paid: the paid-on date is today or earlier; scheduled: a date still ahead */
  state: 'paid' | 'scheduled' | 'unpaid'
  date?: string
  /** unticked on the Extras list but paid: listed and in Paid, never in Planned */
  off: boolean
}

export interface OneOffGroup {
  /** registry id */
  cat: string
  /** in base currency: the ticked extras */
  planned: number
  /** in base currency: the settled ledger rows of this category */
  paid: number
  items: OneOffItem[]
  /** payments not written by a listed extra: the latest, and how many more */
  logged?: { note: string; date: string; more: number }
}

export interface OneOffs {
  groups: OneOffGroup[]
  plannedTotal: number
  paidTotal: number
  /** unticked AND unpaid: the only extras no total on the card counts */
  excluded: number
  excludedCount: number
}

export function oneOffs(state: TripState, ledger: LedgerEntry[], todayIso: string): OneOffs {
  const rates = state.rates
  const byCat = new Map<string, OneOffGroup>()
  const group = (cat: string) => {
    let g = byCat.get(cat)
    if (!g) byCat.set(cat, (g = { cat, planned: 0, paid: 0, items: [] }))
    return g
  }
  let excluded = 0
  let excludedCount = 0
  const listed = new Set<string>()
  for (const x of state.extras ?? []) {
    const off = x.include === false
    if (off && !x.paidOn) {
      excluded += toBase(x.amount, x.cur, rates)
      excludedCount++
      continue
    }
    const g = group(extraCategoryId(x.category))
    if (!off) g.planned += toBase(x.amount, x.cur, rates)
    g.items.push({
      id: x.id,
      label: x.label,
      state: !x.paidOn ? 'unpaid' : isSettled(x.paidOn, todayIso) ? 'paid' : 'scheduled',
      date: x.paidOn || undefined,
      off,
    })
    listed.add(x.id)
  }
  for (const e of ledger) {
    if (e.type !== 'expense' || !isSettled(e.date, todayIso)) continue
    const fromExtra = e.source?.kind === 'extra'
    // An extra's row counts whatever its category (a vaccine files under
    // health); anything else only in the one-off categories.
    if (!fromExtra && !ONE_OFF_CATEGORIES.has(e.category)) continue
    const g = group(e.category)
    g.paid += toBase(e.amount, e.currency, rates)
    // A listed extra's own row is that extra's line. Everything else, typed on
    // Money or left behind by an extra since deleted, is a logged payment.
    if (fromExtra && listed.has(e.source!.id)) continue
    const note = e.note?.trim() ?? ''
    if (!g.logged) g.logged = { note, date: e.date, more: 0 }
    else {
      g.logged.more++
      if (e.date > g.logged.date) { g.logged.note = note; g.logged.date = e.date }
    }
  }
  const groups = [...byCat.values()].sort((a, b) => Math.max(b.planned, b.paid) - Math.max(a.planned, a.paid))
  return {
    groups,
    plannedTotal: groups.reduce((a, g) => a + g.planned, 0),
    paidTotal: groups.reduce((a, g) => a + g.paid, 0),
    excluded,
    excludedCount,
  }
}
