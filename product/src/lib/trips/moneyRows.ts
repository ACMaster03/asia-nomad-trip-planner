import type { LedgerEntry, Segment, TripState } from './types'
import { toBase } from './format.ts'
import { categoryLabel } from './categories.ts'
import { addDays, type bookingsSummary } from './spending.ts'

// Two lists the phone's Money page reads off the journey (MoneyModel.swift
// `upcoming` and `spentParts`), pure and node-testable.

export interface Upcoming {
  id: string
  title: string
  category: string
  date: string
  /** in the base currency */
  amount: number
  /** the stop a stay belongs to; none for anything else */
  city?: string
  atCheckIn: boolean
  /** what a tap opens: the entry's form, or the booking's on Trip */
  opens: { kind: 'entry'; entry: LedgerEntry } | { kind: 'stay'; id: string } | { kind: 'transport'; id: string }
}

/**
 * Every charge dated after today but the subscriptions, soonest first (#149,
 * Upcoming charges): entries dated ahead, and booked stays and legs with no
 * entry yet, on the day they are charged.
 */
export function upcomingCharges(
  state: TripState,
  ledger: LedgerEntry[],
  bookings: ReturnType<typeof bookingsSummary>,
  rates: Record<string, number>,
  todayIso: string,
): Upcoming[] {
  const segs = new Map(state.segments.map((s) => [s.id, s]))
  const stays = new Map(state.stays.map((st) => [st.id, st]))
  const legs = new Map(state.transport.map((t) => [t.id, t]))
  const stayCity = (id: string) => { const st = stays.get(id); return st ? segs.get(st.segId)?.city : undefined }
  const rows: Upcoming[] = []
  for (const e of ledger) {
    if (e.type !== 'expense' || !e.date || e.date <= todayIso || e.source?.kind === 'sub' || e.orphaned) continue
    const isStay = e.source?.kind === 'stay'
    rows.push({
      id: e.id,
      title: e.note?.trim() || categoryLabel(e.category),
      category: e.category,
      date: e.date,
      amount: toBase(e.amount, e.currency, rates),
      city: isStay ? stayCity(e.source!.id) : undefined,
      atCheckIn: isStay && !!stays.get(e.source!.id)?.chargeAtCheckIn,
      opens: e.source?.kind === 'stay' ? { kind: 'stay', id: e.source.id }
        : e.source?.kind === 'transport' ? { kind: 'transport', id: e.source.id }
        : { kind: 'entry', entry: e },
    })
  }
  for (const b of [...bookings.stays, ...bookings.transport]) {
    if (b.status !== 'unpaid') continue
    if (b.kind === 'stay') {
      const st = stays.get(b.id)
      if (!st) continue
      const seg = segs.get(st.segId)
      const d = [st.chargeAtCheckIn ? st.checkIn : st.chargeDate, st.checkIn, seg?.arrive].find((x) => !!x)
      if (!d || d <= todayIso) continue
      rows.push({ id: `stay:${b.id}`, title: st.name || 'Stay', category: 'stays', date: d, amount: b.amount, city: seg?.city, atCheckIn: !!st.chargeAtCheckIn, opens: { kind: 'stay', id: b.id } })
    } else {
      const t = legs.get(b.id)
      if (!t || !b.date || b.date <= todayIso) continue
      rows.push({ id: `transport:${b.id}`, title: `${t.from} → ${t.to}`, category: 'transport', date: b.date, amount: b.amount, atCheckIn: false, opens: { kind: 'transport', id: b.id } })
    }
  }
  return rows.sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : b.amount - a.amount))
}

export interface SpentPart {
  id: string
  kind: 'before' | 'stop' | 'between'
  /** the stop's city; none before departure and between stops */
  city?: string
  from?: string
  to?: string
  total: number
  isCurrent: boolean
}

/** The stop a day belongs to: the one whose dates hold it, the later one on a travel day (you move to the stop you move to, as on Trip). None between stops. */
export function ownerOf(state: TripState, date: string): Segment | undefined {
  return state.segments
    .filter((s) => s.include !== false && !!s.arrive && !!s.depart && s.arrive <= date && date <= s.depart)
    .sort((a, b) => b.arrive.localeCompare(a.arrive))[0]
}

/**
 * Spent so far, by where it was spent (Patrik, 4 Oct): before departure, then
 * each stop by date, then anything between stops. The parts add up to the
 * projection's spent.
 */
export function spentByPlace(state: TripState, ledger: LedgerEntry[], rates: Record<string, number>, todayIso: string, current: Segment | null): SpentPart[] {
  const start = state.meta.startDate || undefined
  let before = 0
  let between = 0
  const byStop = new Map<string, number>()
  for (const e of ledger) {
    if (e.type !== 'expense' || !e.date || e.date > todayIso) continue
    const v = toBase(e.amount, e.currency, rates)
    if (start && e.date < start) before += v
    else {
      const seg = ownerOf(state, e.date)
      if (seg) byStop.set(seg.id, (byStop.get(seg.id) ?? 0) + v)
      else between += v
    }
  }
  const parts: SpentPart[] = []
  if (before > 0) parts.push({ id: 'before', kind: 'before', to: start ? addDays(start, -1) : undefined, total: before, isCurrent: false })
  const stops = state.segments
    .filter((s) => s.include !== false && !!s.arrive && s.arrive <= todayIso)
    .sort((a, b) => a.arrive.localeCompare(b.arrive))
  for (const seg of stops) {
    const total = byStop.get(seg.id) ?? 0
    if (total <= 0 && seg.id !== current?.id) continue
    // Its days end the day before the next stop begins: a travel day is the next stop's.
    let to = !seg.depart || seg.depart > todayIso ? todayIso : seg.depart
    const next = stops.find((s) => s.arrive > seg.arrive)
    if (next && next.arrive <= to) to = addDays(next.arrive, -1)
    parts.push({ id: seg.id, kind: 'stop', city: seg.city, from: seg.arrive, to, total, isCurrent: seg.id === current?.id })
  }
  if (between > 0) parts.push({ id: 'between', kind: 'between', total: between, isCurrent: false })
  return parts
}

/** Spending at a stop kept out of the daily average, up to today (the stop view's last line). */
export function beyondEverydayAt(state: TripState, ledger: LedgerEntry[], rates: Record<string, number>, todayIso: string, seg: Segment, isEveryday: (e: LedgerEntry) => boolean): number {
  return ledger
    .filter((e) => e.type === 'expense' && !!e.date && e.date <= todayIso && !isEveryday(e) && ownerOf(state, e.date)?.id === seg.id)
    .reduce((a, e) => a + toBase(e.amount, e.currency, rates), 0)
}
