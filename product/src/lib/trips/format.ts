import type { Segment } from './types'

export const fmtHUF = (n: number) =>
  Math.round(Number(n) || 0).toLocaleString('en-US').replace(/,/g, ' ') + ' Ft'
export const fmtUSD = (n: number) => '$' + Math.round(Number(n) || 0)

export const toHUF = (amt: number, cur: string, rates: Record<string, number>) =>
  (Number(amt) || 0) * (rates[cur] || 0)
export const usdToHUF = (u: number, rates: Record<string, number>) =>
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
