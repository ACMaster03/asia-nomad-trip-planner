/**
 * Which currency a NEW ledger entry starts on.
 *
 * It used to be "the last expense you typed", which is right only until you
 * cross a border: on a Bangkok stop the next thing you log is a THB coffee,
 * not another HUF flight, and the last-used rule kept offering the flight's
 * currency for days. Where you are beats what you last typed.
 *
 * Only currencies the trip actually WATCHES are offered. An unwatched code has
 * no rate, so it would total as zero and the sheet's "approximately" line would
 * go blank. The FX panel auto-adds every itinerary country's currency, so the
 * country you are standing in is normally watched already; this is the guard
 * for the case where the owner removed it by hand.
 *
 * Kept free of catalogue imports on purpose: those resolve through a path
 * alias the node test runner cannot follow, so the caller looks the country's
 * codes up and passes them in.
 */
export function pickEntryCurrency({
  hereCodes,
  watched,
  lastUsed,
  base,
}: {
  /** currencies of the country the traveller is in today, in catalogue order */
  hereCodes: readonly string[]
  /** the trip's watchlist (the keys of state.rates) */
  watched: readonly string[]
  /** the currency of the most recent expense, if there is one */
  lastUsed?: string | null
  /** the trip's base currency, which is always a valid answer */
  base: string
}): string {
  const usable = (c: string | null | undefined): c is string => !!c && watched.includes(c)
  // A country can run on several currencies (Cambodia genuinely uses KHR and
  // USD). Catalogue order decides, which puts the domestic one first.
  for (const code of hereCodes) if (usable(code)) return code
  if (usable(lastUsed)) return lastUsed
  return base
}
