import type { Segment, Stay } from './types'

// Money formatting is BASE-CURRENCY AWARE (2026-07-25). Before this, fmtHUF
// appended a literal " Ft" to everything: meta.baseCurrency was stored and the
// Settings dropdown let you change it, but switching base RELABELLED every
// number without converting it. Wrong totals, silently.
//
// Locale is chosen per currency so each one reads the way its users expect —
// hu-HU renders HUF as "1 234 567 Ft", exactly the old output, while everything
// else falls back to en-US narrow symbols ($, €, ฿, ₫, ៛, ₭).
const MONEY_LOCALE: Record<string, string> = { HUF: 'hu-HU' }

/**
 * The number without its currency, grouped the way that currency's readers
 * expect. For tables that state the currency once in the header: three money
 * columns of "1 181 207 Ft" do not fit a 390px phone, and three columns of
 * "1 181 207" do.
 */
export function fmtAmount(n: number, currency: string): string {
  const v = Math.round(Number(n) || 0)
  return new Intl.NumberFormat(MONEY_LOCALE[currency] ?? 'en-US', {
    maximumFractionDigits: 0,
  }).format(v)
}

export function fmtMoney(n: number, currency: string): string {
  const v = Math.round(Number(n) || 0)
  const locale = MONEY_LOCALE[currency] ?? 'en-US'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 0,
    }).format(v)
  } catch {
    // Unknown/invalid code — never throw in a render path.
    return `${v.toLocaleString('en-US')} ${currency}`
  }
}

export const fmtUSD = (n: number) => '$' + Math.round(Number(n) || 0)

// Convert an amount in `cur` into the trip's BASE currency. rates are
// base-per-unit (useTripScreen merges them from fx_rates), so this is already
// base-correct — only the name used to say HUF.
export const toBase = (amt: number, cur: string, rates: Record<string, number>) =>
  (Number(amt) || 0) * (rates[cur] || 0)

// Catalogue city costs are denominated in USD (cities.json is $/day), so this
// converts THAT reference into base. Unrelated to the trip's base choice.
export const usdToBase = (u: number, rates: Record<string, number>) =>
  (Number(u) || 0) * (rates.USD || 0)

export const nightsBetween = (a?: string, b?: string) => {
  if (!a || !b) return 0
  const d = (+new Date(b) - +new Date(a)) / 86_400_000 // UTC parse, like core.js
  return d > 0 ? Math.round(d) : 0
}
export const segNights = (s: Segment) =>
  s.nights != null ? s.nights : nightsBetween(s.arrive, s.depart)

// A stay's nights and full cost — the ONE definition (owner note, 2026-09-11:
// the Stays card "shows the per night stay and not the full cost and it isn't
// clear"). The stay's own `nights` override wins; otherwise the stop's length.
export function stayNights(st: Stay, seg: Segment | undefined): number {
  return st.nights != null ? st.nights : seg ? segNights(seg) : 0
}
export function stayTotal(st: Stay, seg: Segment | undefined): number {
  return st.ppn * stayNights(st, seg)
}

export const regName = (r: string) =>
  r === 'SE' ? 'Southeast Asia' : r === 'EA' ? 'East Asia' : r === 'SA' ? 'South Asia' : r
export const regColor = (r?: string | null) =>
  r === 'SE' ? '#37b3a4' : r === 'EA' ? '#6c8ccf' : '#cf8a6c'
export const monthLabel = (key: string) =>
  new Date(key + '-01T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' })
export const monthShort = (key: string) =>
  new Date(key + '-01T00:00:00').toLocaleString('en-US', { month: 'short', year: '2-digit' })

export const TIER_LABELS = ['Budget', 'Mid', 'Comfort'] as const

// Relative time for feed rows and comments ("2h ago"). Lifted from the follow
// page so the journey, post and Home feeds all say it the same way.
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - +new Date(iso)) / 60_000))
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

// Local calendar date as ISO (YYYY-MM-DD) — the viewer's clock, not UTC.
export function localISODate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * "12 nights in Hanoi, 5 in Da Nang". The unit is said once and then implied,
 * and it pluralises, because a handover day leaves exactly one night in the
 * month you arrive in: the real trip's September reads "29 nights in Bangkok,
 * 1 in Hanoi" and August, before it, was a single night.
 * because repeating "nights" for every city is what makes these lines too long
 * to read on a phone. Three cities at most: beyond that the month is a blur of
 * moving and the exact split stops being the point.
 *
 * WHICH THREE AND IN WHAT ORDER ARE TWO SEPARATE QUESTIONS, and answering them
 * with one sort was the bug. `where` arrives in travel order. Ranking it by
 * nights to pick the three that matter also reordered them, so December read
 * "13 nights in Da Nang, 4 in Hong Kong, 1 in Hanoi" when the month is
 * actually Hanoi, then Da Nang, then Hong Kong. So: choose by size, print in
 * travel order. Dropping the three longest stays to keep a one-night handover
 * would be the opposite mistake, and the chronological slice would have made
 * it.
 */
export function whereLine(where: { city: string; nights: number }[]): string {
  const keep = where
    .map((w, i) => ({ ...w, i }))
    .sort((a, b) => b.nights - a.nights || a.i - b.i)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i)
  const rest = where.length - keep.length
  const parts = keep.map((w, i) =>
    i === 0 ? `${w.nights} night${w.nights === 1 ? '' : 's'} in ${w.city}` : `${w.nights} in ${w.city}`,
  )
  return parts.join(', ') + (rest > 0 ? `, +${rest} more` : '')
}
