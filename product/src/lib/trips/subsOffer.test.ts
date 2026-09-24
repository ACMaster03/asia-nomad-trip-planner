import { test } from 'node:test'
import assert from 'node:assert/strict'
import { subsOfferRows, acceptOffer, dismissOffer, offerLinks } from './subsOffer.ts'
import { subChargesDue } from './importCosts.ts'
import type { LedgerEntry, Subscription, TripState } from './types.ts'

const e = (id: string, date: string, note: string, amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id, date, type: 'expense', category: 'subscriptions', amount, currency: 'HUF', note, ...extra })
const TODAY = '2026-09-24'
let n = 0
type Doc = { subscriptions?: Subscription[]; subsOfferDone?: string }
const empty = (): Doc => ({ subscriptions: [] })
const newId = () => `sub-new-${++n}`

// Mock 16 §8's five, typed before round 3: iCloud twice.
const ledger = [
  e('ic1', '2026-08-14', 'iCloud 2 TB', 3290),
  e('ic2', '2026-09-14', 'icloud  2 tb', 3290),
  e('sp', '2026-09-17', 'Spotify Duo', 2490),
  e('net', '2026-08-23', 'Home internet · Budapest flat', 7990),
  e('dom', '2025-11-12', 'Domain + hosting', 18_000),
  e('nf', '2026-08-20', 'Netflix', 4490),
]

test('one row per name, from its newest entry, newest first', () => {
  const rows = subsOfferRows(ledger, [])
  assert.deepEqual(rows.map((r) => r.latest.id), ['sp', 'ic2', 'net', 'nf', 'dom'])
  assert.deepEqual(rows.find((r) => r.latest.id === 'ic2')!.ids, ['ic1', 'ic2'])
})

test('left out: a declared name (even cancelled), an answered entry, no name, a written charge, other categories', () => {
  const subs: Subscription[] = [
    { id: 's-sp', label: 'Spotify Duo', cur: 'HUF', amount: 2490, everyMonths: 1, anchor: '2026-08-17' },
    { id: 's-nf', label: 'netflix', cur: 'HUF', amount: 4490, everyMonths: 1, anchor: '2026-08-20', cancelledOn: '2026-09-06' },
  ]
  const more = [
    ...ledger,
    e('linked', '2026-09-20', 'Disney+', 3000, { subId: 's-x' }),
    e('once', '2026-09-02', 'Visa run', 9000, { subId: null }),
    e('unnamed', '2026-09-03', '  ', 1500),
    e('written', '2026-09-25', 'Other thing', 1000, { source: { kind: 'sub', id: 's-o@2026-09-25' } }),
    e('food', '2026-09-04', 'Netflix and pho', 900, { category: 'food' }),
    e('refund', '2026-09-05', 'Refund', 900, { type: 'income' }),
  ]
  assert.deepEqual(subsOfferRows(more, subs).map((r) => r.key), ['icloud 2 tb', 'home internet · budapest flat', 'domain + hosting'])
})

test('Add: a subscription per repeating row, reminders on, settled; the entries are linked', () => {
  const rows = subsOfferRows(ledger, [])
  const answers = { 'domain + hosting': 12, netflix: 0 }
  const { next, made } = acceptOffer(empty(), rows, answers, TODAY, newId)
  assert.equal(next.subsOfferDone, TODAY)
  assert.equal(next.subscriptions!.length, 4)
  const icloud = next.subscriptions!.find((s) => s.label === 'icloud  2 tb')!
  assert.deepEqual(
    { every: icloud.everyMonths, anchor: icloud.anchor, from: icloud.autoFrom, remind: icloud.remind, lead: icloud.leadDays },
    { every: 1, anchor: '2026-09-14', from: TODAY, remind: true, lead: 3 },
  )
  assert.equal(next.subscriptions!.find((s) => s.label === 'Domain + hosting')!.everyMonths, 12)
  const links = offerLinks(rows, answers, made!)
  assert.deepEqual(links.filter((l) => l.subId === icloud.id).map((l) => l.id).sort(), ['ic1', 'ic2'])
  assert.deepEqual(links.find((l) => l.id === 'nf'), { id: 'nf', subId: null }, 'Doesn’t repeat is an answer')
})

test('answered first by the other traveller: nothing is added, nothing linked', () => {
  const rows = subsOfferRows(ledger, [])
  const settled: Doc = { subscriptions: [], subsOfferDone: '2026-09-23' }
  const { next, made } = acceptOffer(settled, rows, {}, TODAY, newId)
  assert.equal(next, settled)
  assert.equal(made, null)
  assert.equal(dismissOffer(settled, TODAY), settled)
})

test('a name declared meanwhile is not declared twice, and its entries are left alone', () => {
  const rows = subsOfferRows(ledger, [])
  const meanwhile: Doc = { subscriptions: [{ id: 's-sp', label: 'Spotify Duo', cur: 'HUF', amount: 2490, everyMonths: 1, anchor: '2026-09-17' }] }
  const { next, made } = acceptOffer(meanwhile, rows, {}, TODAY, newId)
  assert.equal(next.subscriptions!.filter((s) => s.label === 'Spotify Duo').length, 1)
  assert.equal(offerLinks(rows, {}, made!).some((l) => l.id === 'sp'), false)
})

test('charges are written from today on, never for the weeks before the offer', () => {
  const rows = subsOfferRows(ledger, [])
  // the domain set to yearly by hand, as in the mock
  const { next } = acceptOffer(empty(), rows, { 'domain + hosting': 12 }, TODAY, newId)
  const state = {
    meta: { version: 1, tripName: 'Asia', travelers: 2, baseCurrency: 'HUF', startDate: '2026-08-31', endDate: '2027-04-30' },
    rates: { HUF: 1 }, segments: [], stays: [], transport: [], extras: [], notes: {},
    subscriptions: next.subscriptions,
  } as unknown as TripState
  // Home internet, last logged on 23 Aug: its 23 Sep charge is not made up.
  assert.deepEqual(subChargesDue(state, ledger, TODAY), [])
  // A month on, the charges after the offer are written; the yearly domain's
  // next one is 12 Nov.
  assert.deepEqual(
    subChargesDue(state, ledger, '2026-10-24').map((c) => `${c.note} ${c.date}`).sort(),
    ['Home internet · Budapest flat 2026-10-23', 'Netflix 2026-10-20', 'Spotify Duo 2026-10-17', 'icloud  2 tb 2026-10-14'],
  )
})

test('No thanks settles the offer and adds nothing', () => {
  const next = dismissOffer(empty(), TODAY)
  assert.equal(next.subsOfferDone, TODAY)
  assert.deepEqual(next.subscriptions, [])
})
