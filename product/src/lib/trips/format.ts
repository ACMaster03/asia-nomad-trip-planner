import type { Segment } from './types'

// Money formatting is BASE-CURRENCY AWARE (2026-07-25). Before this, fmtHUF
// appended a literal " Ft" to everything: meta.baseCurrency was stored and the
// Settings dropdown let you change it, but switching base RELABELLED every
// number without converting it. Wrong totals, silently.
//
// Locale is chosen per currency so each one reads the way its users expect —
// hu-HU renders HUF as "1 234 567 Ft", exactly the old output, while everything
// else falls back to en-US narrow symbols ($, €, ฿, ₫, ៛, ₭).
const MONEY_LOCALE: Record<string, string> = { HUF: 'hu-HU' }

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

export const regName = (r: string) =>
  r === 'SE' ? 'Southeast Asia' : r === 'EA' ? 'East Asia' : r === 'SA' ? 'South Asia' : r
export const regColor = (r?: string | null) =>
  r === 'SE' ? '#37b3a4' : r === 'EA' ? '#6c8ccf' : '#cf8a6c'
export const monthLabel = (key: string) =>
  new Date(key + '-01T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' })
export const monthShort = (key: string) =>
  new Date(key + '-01T00:00:00').toLocaleString('en-US', { month: 'short', year: '2-digit' })

export const TIER_LABELS = ['Budget', 'Mid', 'Comfort'] as const
