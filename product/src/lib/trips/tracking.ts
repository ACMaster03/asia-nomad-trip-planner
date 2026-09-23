// === Money's once-per-account question (mock 16 §1–2, #62; migration 41) ===
//
// profiles.track_spending holds the person's answer to "Track what you spend
// on this journey?". The page reads it as one of four states:
//
//   ask      null: not asked yet. The question shows, as a sheet over the
//            quiet page, and sliding it away counts as "Not now".
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

/** The quiet page shows the Bookings card, the add button and the way back; no spending. */
export const isQuiet = (t: Tracking) => t === 'ask' || t === 'no'
