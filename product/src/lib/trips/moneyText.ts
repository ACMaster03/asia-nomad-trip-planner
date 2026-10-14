// The phone's MoneyText (MoneyModel.swift): how a big figure reads on Money.
// Every function takes the page's `fmt` (useMoney: the base currency's full
// spelling, "1 327 825 Ft") so the symbol and its side come from one place.

/** The currency's symbol as `fmt` writes it: "Ft", "$", "฿". */
export const symbolOf = (fmt: (n: number) => string) => fmt(0).replace(/[\d.,\s\u202f\u00a0]/g, '')

/** Big amounts rounded to read at a glance (Patrik, 27 Sep): "1.33 M Ft"; under a million the whole amount. */
export function shortMoney(n: number, fmt: (n: number) => string): string {
  if (Math.abs(n) < 1_000_000) return fmt(n)
  const m = n / 1_000_000
  const digits = Math.abs(m) >= 100 ? 0 : Math.abs(m) >= 10 ? 1 : 2
  const num = m.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')
  const sym = symbolOf(fmt)
  return /^\d/.test(fmt(1)) || sym.length > 1 ? `${num} M ${sym}` : `${sym}${num} M`
}

/** A projection: rounded, "≈ 465 800 Ft", "≈ 2.64 M Ft". */
export function approxMoney(n: number, fmt: (n: number) => string): string {
  const step = Math.abs(n) >= 100_000 ? 100 : Math.abs(n) >= 10_000 ? 10 : 1
  return '≈ ' + shortMoney(Math.round(n / step) * step, fmt)
}

/** The ring's centre, no currency: "400 k", "1.2 M". */
export function compactNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' M'
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)} k`
  return `${Math.round(n)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const short = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` }

/** "today", "yesterday", "12 Sep". */
export function relativeDay(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'today'
  if (Date.parse(todayIso + 'T00:00:00Z') - Date.parse(iso + 'T00:00:00Z') === 86_400_000) return 'yesterday'
  return short(iso)
}

/** "today", "tomorrow", "in 3 days". */
export const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

/** "12 000 THB" — an entry's own amount, when it isn't in the base currency. */
export const originalAmount = (amount: number, cur: string) =>
  `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount).replace(/,/g, ' ')} ${cur}`
