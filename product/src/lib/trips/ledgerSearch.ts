import type { LedgerEntry } from './types'
import { categoryLabel } from './categories.ts'
import { toBase } from './format.ts'

// Search on All entries (Petra, 24 Sep: "I had to swipe through the All
// entries to find the iCloud subs"). It matches what a row shows: the entry's
// name and its category. An entry saved without a name shows its category
// instead, so a search by name alone would never find it. Every word typed has
// to appear, in any order, ignoring case and accents: "pho" finds "Phở", and
// "icloud tb" finds "iCloud 2 TB". Vietnamese đ is a letter of its own, not a d
// with a mark, so it is folded by hand: "da nang" finds "Đà Nẵng".
//
// What the matches cost follows the month totals' rule (ledgerView.ts): a row
// dated after today is scheduled, so it is listed but not counted, and it comes
// after what was logged, never above it.

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd')

export interface LedgerSearch {
  /** matches dated today or before, newest first */
  past: LedgerEntry[]
  /** matches dated after today, soonest first */
  scheduled: LedgerEntry[]
  /** in the base currency, past matches only */
  spent: number
  received: number
}

/** null for an empty query: the screen shows the whole list. */
export function searchLedger(
  entries: LedgerEntry[],
  rates: Record<string, number>,
  query: string,
  todayIso: string,
): LedgerSearch | null {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return null
  const hits = entries
    .filter((e) => {
      const shown = fold(`${e.note ?? ''} ${categoryLabel(e.category)}`)
      return words.every((w) => shown.includes(w))
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const past = hits.filter((e) => e.date <= todayIso)
  let spent = 0, received = 0
  for (const e of past) {
    const v = toBase(e.amount, e.currency, rates)
    if (e.type === 'expense') spent += v
    else received += v
  }
  return { past, scheduled: hits.filter((e) => e.date > todayIso).reverse(), spent, received }
}
