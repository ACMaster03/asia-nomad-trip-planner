import type { LedgerEntry, Subscription } from './types'
import { dayAfter, nameKey, subFromEntry } from './subscriptions.ts'

// The one-time offer (mock 16 §8, round 3b; #59: "existing entries in the
// category get the offer once, so the eight to ten on the live trip surface
// without retyping"). Round 3a asks on the entry form, but only when an entry
// is opened, so the entries typed before it sit in Subscriptions undeclared.
// The offer lists them on one card, once.
//
// A row is a NAME, not an entry: iCloud charged twice is one subscription, so
// it is one row, made from its newest entry (amount, currency, date). The mock
// grouped by name and amount; a price rise would then have made two rows, and
// two subscriptions of one thing. All the row's entries are linked to what it
// becomes.
//
// Listed: expenses in Subscriptions that were never asked (subId unset) and
// have a name, unless a subscription of that name exists, live or cancelled:
// those are charges of something declared already. Left out: an entry without
// a name (a subscription needs one, and the entry form can still declare it),
// one said not to repeat (subId null), and a charge the app wrote.
//
// Its charges are written from TODAY (autoFrom), not from the day after the
// entry, as the entry form does. That entry can be weeks old: Home internet
// last logged on 23 Aug would have had its 23 Sep charge written the moment
// Add was pressed, and in the mock Netflix was cancelled on 6 Sep, so its
// 20 Sep charge never happened. The months before the offer stay as they were
// logged, the rule every subscription older than round 3 follows.

export interface OfferRow {
  /** the name, folded: what the rows and the answers are keyed by */
  key: string
  /** the newest entry of this name, which the subscription is made from */
  latest: LedgerEntry
  /** every entry of this name */
  ids: string[]
}

/** Newest first, like All entries. Empty when there is nothing to offer. */
export function subsOfferRows(ledger: LedgerEntry[], subs: Subscription[]): OfferRow[] {
  const declared = new Set(subs.map((s) => nameKey(s.label)))
  const rows = new Map<string, OfferRow>()
  for (const e of ledger) {
    if (e.type !== 'expense' || e.category !== 'subscriptions' || e.subId !== undefined || e.source) continue
    const key = nameKey(e.note ?? '')
    if (!key || declared.has(key)) continue
    const row = rows.get(key)
    if (!row) rows.set(key, { key, latest: e, ids: [e.id] })
    else {
      row.ids.push(e.id)
      if (e.date > row.latest.date) row.latest = e
    }
  }
  return [...rows.values()].sort((a, b) => (a.latest.date < b.latest.date ? 1 : a.latest.date > b.latest.date ? -1 : 0))
}

/** Each row's answer by key: every N months, or 0 for Doesn't repeat. Unset is monthly. */
export type OfferAnswers = Record<string, number>
export const everyOf = (answers: OfferAnswers, key: string) => answers[key] ?? 1

type WithSubs = { subscriptions?: Subscription[]; subsOfferDone?: string }

/**
 * Add, applied to the journey: a subscription for every row that repeats,
 * with the reminder on (the mock: "Reminders on, 3 days before") and its
 * charges written from today, and the day the offer was settled. Someone else may have answered first, on a page that
 * was not refreshed yet: then nothing changes (`made` is null), and a name
 * declared in the meantime is never declared twice.
 */
export function acceptOffer<S extends WithSubs>(
  cur: S, rows: OfferRow[], answers: OfferAnswers, todayIso: string, newId: () => string,
): { next: S; made: Map<string, string> | null } {
  if (cur.subsOfferDone) return { next: cur, made: null }
  const subs = cur.subscriptions ?? []
  const declared = new Set(subs.map((s) => nameKey(s.label)))
  const made = new Map<string, string>()
  const added: Subscription[] = []
  for (const row of rows) {
    const every = everyOf(answers, row.key)
    if (every <= 0 || declared.has(row.key)) continue
    const id = newId()
    const e = row.latest
    const sub = subFromEntry({ label: e.note, amount: e.amount, cur: e.currency, date: e.date }, every, true, id)
    added.push({ ...sub, autoFrom: [todayIso, dayAfter(e.date)].sort()[1] })
    made.set(row.key, id)
  }
  return { next: { ...cur, subscriptions: [...subs, ...added], subsOfferDone: todayIso }, made }
}

/** No thanks: settled, nothing added. The entry form still asks, entry by entry. */
export const dismissOffer = <S extends WithSubs>(cur: S, todayIso: string): S =>
  cur.subsOfferDone ? cur : { ...cur, subsOfferDone: todayIso }

/**
 * What each listed entry records after Add: the subscription its row became,
 * or null where the row doesn't repeat, so the entry form shows that answer
 * and never asks again. A row declared by someone else meanwhile is left alone.
 */
export function offerLinks(rows: OfferRow[], answers: OfferAnswers, made: Map<string, string>): { id: string; subId: string | null }[] {
  const out: { id: string; subId: string | null }[] = []
  for (const row of rows) {
    const subId = made.get(row.key) ?? (everyOf(answers, row.key) <= 0 ? null : undefined)
    if (subId === undefined) continue
    for (const id of row.ids) out.push({ id, subId })
  }
  return out
}
