import type { LedgerEntry, Stay, TransportLeg, TripState } from './types'
import { segNights } from './format'

// === Auto-import planned costs into the ledger (mock 04, ledger states) ===
//
// One-way sync, plan → ledger. A "booking" is importable when it is
//   booked (status booked/chosen) + included + has a charge date
// (stays: chargeDate — the free-cancel-deadline+1 the user typed; transport:
// the travel date — fares are committed money once booked).
//
// Imported entries carry `source` ("⤵ from plan" badge) and keep syncing:
// amount/date/currency/note follow the plan until the booking disappears, at
// which point the row STAYS and is flagged `orphaned` (decided in the gap
// review — money already spent doesn't vanish from the books).
//
// `state.importSkip` lists source keys the user explicitly deleted from the
// ledger; without it, reconcile would resurrect every deleted row.
// `state.autoImport` — undefined means "never asked": the Ledger shows the
// import card. true = future bookings land silently; false = card returns
// only when NEW unimported bookings appear.

export type ImportSource = { kind: 'stay' | 'transport'; id: string }

export const sourceKey = (s: ImportSource) => `${s.kind}:${s.id}`

const isBooked = (status?: string) =>
  ['booked', 'chosen'].includes((status ?? '').toLowerCase())

interface Candidate {
  source: ImportSource
  date: string
  category: 'Stays' | 'Transport'
  amount: number
  currency: string
  note: string
}

function stayCandidate(st: Stay, state: TripState): Candidate | null {
  if (!isBooked(st.status) || st.include === false || !st.chargeDate) return null
  const seg = state.segments.find((s) => s.id === st.segId)
  const nights = st.nights != null ? st.nights : seg ? segNights(seg) : 0
  const amount = st.ppn * nights
  if (!(amount > 0)) return null
  return {
    source: { kind: 'stay', id: st.id },
    date: st.chargeDate,
    category: 'Stays',
    amount,
    currency: st.cur,
    note: st.name,
  }
}

function transportCandidate(t: TransportLeg): Candidate | null {
  if (!isBooked(t.status) || t.include === false || !t.date) return null
  if (!(t.price > 0)) return null
  return {
    source: { kind: 'transport', id: t.id },
    date: t.date,
    category: 'Transport',
    amount: t.price,
    currency: t.cur,
    note: `${t.type} ${t.from} → ${t.to}`,
  }
}

function toEntry(c: Candidate, id: string): LedgerEntry {
  return {
    id,
    date: c.date,
    type: 'expense',
    category: c.category,
    amount: c.amount,
    currency: c.currency,
    note: c.note,
    source: c.source,
  }
}

export interface ImportPlan {
  /** bookings not yet in the ledger (and not skipped) — the import card's N */
  candidates: LedgerEntry[]
  /** already-imported rows whose booking changed — bring them in line */
  updates: LedgerEntry[]
  /** already-imported rows whose booking is gone — flag, never delete */
  orphans: LedgerEntry[]
}

export function planImports(state: TripState, ledger: LedgerEntry[]): ImportPlan {
  const wanted = new Map<string, Candidate>()
  for (const st of state.stays) {
    const c = stayCandidate(st, state)
    if (c) wanted.set(sourceKey(c.source), c)
  }
  for (const t of state.transport) {
    const c = transportCandidate(t)
    if (c) wanted.set(sourceKey(c.source), c)
  }

  const skip = new Set(state.importSkip ?? [])
  const candidates: LedgerEntry[] = []
  const updates: LedgerEntry[] = []
  const orphans: LedgerEntry[] = []

  const imported = new Map<string, LedgerEntry>()
  for (const e of ledger) if (e.source) imported.set(sourceKey(e.source), e)

  for (const [key, c] of wanted) {
    const existing = imported.get(key)
    if (!existing) {
      // Deterministic id: re-running the plan (or a double-fired effect) upserts
      // the same row instead of minting duplicates.
      if (!skip.has(key)) candidates.push(toEntry(c, `le-plan-${c.source.kind}-${c.source.id}`))
      continue
    }
    const synced = { ...toEntry(c, existing.id), orphaned: undefined }
    if (
      existing.amount !== synced.amount ||
      existing.date !== synced.date ||
      existing.currency !== synced.currency ||
      existing.note !== synced.note ||
      existing.orphaned
    ) {
      updates.push(synced)
    }
  }

  for (const [key, e] of imported) {
    if (!wanted.has(key) && !e.orphaned) orphans.push({ ...e, orphaned: true })
  }

  return { candidates, updates, orphans }
}
