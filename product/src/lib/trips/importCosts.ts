import type { LedgerEntry, Stay, TransportLeg, TripState } from './types'
// Straight from format.ts, not the budget.ts re-export: budget.ts pulls in the
// catalogue path aliases, which the node tests cannot resolve.
import { stayTotal } from './format.ts'
import { isBookedStatus } from './commitment.ts'
import { chargesBetween, sameName } from './subscriptions.ts'
import { RECURRING_CATEGORY, isEverydayCategory } from './categories.ts'

// === Auto-import planned costs into the ledger (mock 04, ledger states) ===
//
// One-way sync, plan → ledger. A "booking" is importable when it is
//   booked (status booked/chosen) + included + has a charge date
// (stays: chargeDate — the free-cancel-deadline+1 the user typed; transport:
// chargeDate when set, else the travel date — fares are committed money once
// booked). A draft (idea/shortlist) never imports: nothing has been charged.
//
// The planned one-offs (extras: visas, insurance, gear) used to import here
// the moment they had a paid-on date. They were removed with the One-offs card
// (#39, Patrik, 26 Sep: "unnecessary complexity... for a travel app"). The
// row a paid one-off wrote becomes a plain entry, once (see plainFromExtra).
//
// The date matters beyond ordering: the Money page reads rows dated after
// today as SCHEDULED rather than spent, so a fare paid months in advance
// needs its own chargeDate to land in the month the card was actually hit.
//
// Imported entries carry `source` ("⤵ from plan" badge) and keep syncing:
// amount/date/currency/note follow the plan until the booking disappears, at
// which point the row STAYS and is flagged `orphaned` (decided in the gap
// review — money already spent doesn't vanish from the books).
//
// A SUBSCRIPTION CHARGE (Patrik, 24 Sep, #37: "the way booked stays are")
// lands on its charge date once that date has come, never before: a future
// charge is a forecast, and the projection already counts it (subsAhead). The
// row is written once and then belongs to the ledger: a price change on the
// subscription does not rewrite last month, and a deleted or cancelled
// subscription leaves its charges where they are. So these rows never take
// part in the updates or orphan flags below. Each one is announced
// until tapped (ChargeNotice.tsx, Petra's safeguard: "Cancelled it?").
// Nothing is written where a charge is already logged: an entry linked to the
// subscription, or one with its name in the Subscriptions category, within
// COVER_DAYS of the date. Only from `autoFrom` (the day after the entry that
// declared it, or the day it was added on the card), or SUB_CHARGES_FROM for a
// subscription from before this, so no month logged by hand comes back; and
// only inside the journey's dates.
//
// `state.importSkip` lists source keys the user explicitly deleted from the
// ledger; without it, reconcile would resurrect every deleted row.
// `state.autoImport` — undefined or true: bookings land in the ledger on their
// own (default since 2026-09-12 — a charged booking is money spent, and the
// ask-first card only delayed it). false = the opt-out: the Ledger shows the
// import card whenever NEW unimported bookings appear.

export type ImportSource = { kind: 'stay' | 'transport' | 'extra' | 'sub'; id: string }

/** Subscriptions declared before automatic charges shipped start here. */
export const SUB_CHARGES_FROM = '2026-09-25'
const COVER_DAYS = 15

export const sourceKey = (s: ImportSource) => `${s.kind}:${s.id}`

// Amounts are rounded to cents. ppn × nights in floating point (33.71 × 29 =
// 977.5900000000001) round-trips through jsonb fine, but a later rate/nights
// edit could make "existing.amount !== synced.amount" true on noise alone and
// re-sync the row on every visit; rounding makes the comparison exact.
const cents = (n: number) => Math.round(n * 100) / 100

interface Candidate {
  source: ImportSource
  date: string
  /** registry ids (lib/trips/categories.ts) */
  category: string
  amount: number
  currency: string
  note: string
}

function stayCandidate(st: Stay, state: TripState): Candidate | null {
  if (!isBookedStatus(st.status) || st.include === false || !st.chargeDate) return null
  const seg = state.segments.find((s) => s.id === st.segId)
  const amount = cents(stayTotal(st, seg))
  if (!(amount > 0)) return null
  return {
    source: { kind: 'stay', id: st.id },
    date: st.chargeDate,
    category: 'stays',
    amount,
    currency: st.cur,
    note: st.name,
  }
}

function transportCandidate(t: TransportLeg): Candidate | null {
  if (!isBookedStatus(t.status) || t.include === false) return null
  // When the card was charged, if the traveller filled it in; the travel date
  // is the fallback it always was.
  const date = t.chargeDate || t.date
  if (!date) return null
  if (!(t.price > 0)) return null
  return {
    source: { kind: 'transport', id: t.id },
    date,
    category: 'transport',
    amount: cents(t.price),
    currency: t.cur,
    note: `${t.type} ${t.from} → ${t.to}`,
  }
}

/**
 * A paid one-off's row, from before #39, as the entry it now is: typed by hand
 * as far as the app is concerned, and still out of the daily average, as it
 * always was. Gear, insurance & visas and fees are out by category; anything
 * filed under an everyday category (a vaccine under Health, an eSIM) says so
 * itself (#36). "extra removed" goes with the source: the payment happened.
 */
export function plainFromExtra(e: LedgerEntry): LedgerEntry {
  const plain: LedgerEntry = { ...e, ...(isEverydayCategory(e.category) ? { everyday: false } : {}) }
  delete plain.source
  delete plain.orphaned
  return plain
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
  /**
   * already-imported rows whose booking changed — bring them in line; and a
   * paid one-off's row from before #39, as a plain entry (plainFromExtra)
   */
  updates: LedgerEntry[]
  /** already-imported rows whose booking is gone — flag, never delete */
  orphans: LedgerEntry[]
  /** subscription charges whose date has come and that nothing covers yet — add */
  subCharges: LedgerEntry[]
}

const dayDist = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

/** The subscription charges to write now (see the header). */
export function subChargesDue(state: TripState, ledger: LedgerEntry[], todayIso: string): LedgerEntry[] {
  if (!todayIso) return []
  const skip = new Set(state.importSkip ?? [])
  const written = new Set(ledger.filter((e) => e.source?.kind === 'sub').map((e) => sourceKey(e.source!)))
  const start = state.meta.startDate || ''
  const end = state.meta.endDate || ''
  const out: LedgerEntry[] = []
  for (const sub of state.subscriptions ?? []) {
    const from = [sub.autoFrom || SUB_CHARGES_FROM, start].sort()[1]
    const to = end && end < todayIso ? end : todayIso
    for (const at of chargesBetween(sub, from, to)) {
      const source: ImportSource = { kind: 'sub', id: `${sub.id}@${at}` }
      const key = sourceKey(source)
      if (written.has(key) || skip.has(key)) continue
      const covered = ledger.some((e) => e.type === 'expense' && e.source?.kind !== 'sub' && dayDist(e.date, at) <= COVER_DAYS && (
        e.subId === sub.id || (e.subId === undefined && e.category === RECURRING_CATEGORY && sameName(e.note, sub.label))))
      if (covered) continue
      out.push({
        id: `le-sub-${sub.id}-${at}`,
        date: at,
        type: 'expense',
        category: RECURRING_CATEGORY,
        amount: cents(sub.amount),
        currency: sub.cur,
        note: sub.label,
        source,
        subId: sub.id,
      })
    }
  }
  return out
}

export function planImports(state: TripState, ledger: LedgerEntry[], todayIso = ''): ImportPlan {
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

  // Subscription charges are written once and left alone (see the header). A
  // paid one-off's row is no booking any more: it becomes a plain entry, once.
  const imported = new Map<string, LedgerEntry>()
  for (const e of ledger) {
    if (e.source?.kind === 'extra') updates.push(plainFromExtra(e))
    else if (e.source && e.source.kind !== 'sub') imported.set(sourceKey(e.source), e)
  }

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
      existing.category !== synced.category ||
      existing.orphaned
    ) {
      updates.push(synced)
    }
  }

  for (const [key, e] of imported) {
    if (wanted.has(key)) continue
    if (!e.orphaned) orphans.push({ ...e, orphaned: true })
  }

  return { candidates, updates, orphans, subCharges: subChargesDue(state, ledger, todayIso) }
}
