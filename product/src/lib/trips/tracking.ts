import type { LedgerEntry } from './types'

// === Money's once-per-account question (mock 16 §1–2, #62; migration 41) ===
//
// profiles.track_spending holds the person's answer to "Track what you spend
// on this journey?". The page reads it as one of four states:
//
//   ask      null: not asked yet. The question shows, as a sheet over the
//            quiet page, and sliding it away counts as "Not now".
//   yes      true, "Yes, track it": the full page.
//   no       false, "Not now": the quiet page, the bookings and what you add.
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

/** The quiet page shows the bookings card and nothing else of the plan. */
export const isQuiet = (t: Tracking) => t === 'ask' || t === 'no'

// The quiet page's list is what the person added: entries typed on Money, and
// an extra's payment written from its paid-on date. A booked stay's or fare's
// row is already counted by the Bookings card above it, so listing it again
// would show the same money twice on a page of two things.
export const quietEntries = (ledger: LedgerEntry[]) =>
  ledger.filter((e) => !e.source || e.source.kind === 'extra')
