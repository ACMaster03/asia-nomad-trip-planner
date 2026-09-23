import type { LedgerEntry } from './types'

// === Money's once-per-account question (mock 16 §1–2, #62; migration 41) ===
//
// profiles.track_spending holds the person's answer to "Track what you spend
// on this journey?". The page reads it as one of four states:
//
//   ask      null: not asked yet. The question shows as a sheet, and only its
//            two buttons answer it: a swipe closes it until the app is next
//            opened (Petra, 23 Sep, before round 1 merged).
//   yes      true, "Yes, track it": the full page.
//   no       false, "Not now": the quiet page, the bookings, the add button
//            and the way back, and no spending shown.
//   unknown  nothing readable: signed out, offline with nothing cached, or a
//            database without migration 41. The full page as before and no
//            question: Money never blocks on this answer.
export type Tracking = 'ask' | 'yes' | 'no' | 'unknown'

export function trackingOf(value: unknown): Tracking {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  if (value === null) return 'ask'
  return 'unknown'
}

/** Costs typed on Money for this journey; the rows the plan wrote do not count. */
export const hasLoggedSpending = (ledger: LedgerEntry[]) => ledger.some((e) => !e.source)

// The quiet page shows the Bookings card, the add button and the way back;
// no spending. "Not now" gets it. So does an unanswered account behind the
// question, but only one that has logged nothing on this journey: someone
// who already logs costs sees their own page behind the question, so its
// first appearance never looks like their spending vanished, and a swipe
// changes nothing at all.
export const isQuiet = (t: Tracking, loggedSpending: boolean) =>
  t === 'no' || (t === 'ask' && !loggedSpending)
