// The words on the Exchange rates row and page (the phone's TripSettings.swift).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** "Refreshed today, 04:00", "Refreshed yesterday, 04:00", "Refreshed 12 Oct"; without a time, "Saved with the journey". */
export function refreshedText(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'Saved with the journey'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Saved with the journey'
  if (sameDay(d, now)) return `Refreshed today, ${hhmm(d)}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `Refreshed yesterday, ${hhmm(d)}`
  return `Refreshed ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/**
 * One unit of a currency in the base: "10.2 Ft" as the page's `fmt` writes it,
 * or three significant digits when it would round to nothing ("0.0318 $").
 */
export function rateText(rate: number, fmt: (n: number) => string): string {
  if (!(rate > 0)) return '—'
  const full = fmt(rate)
  if (full !== fmt(0)) return full
  const sym = fmt(0).replace(/[\d.,\s  ]/g, '')
  const num = Number(rate.toPrecision(3)).toString()
  return /^\d/.test(fmt(1)) || sym.length > 1 ? `${num} ${sym}` : `${sym}${num}`
}
