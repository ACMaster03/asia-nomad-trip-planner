import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tripPhase, tripRecap } from './recap.ts'
import type { TripState, Segment, LedgerEntry } from './types.ts'

const seg = (id: string, country: string, arrive: string, depart: string, extra: Partial<Segment> = {}): Segment => ({
  id, country, city: id, arrive, depart, ...extra,
})
const exp = (amount: number, category: string, currency = 'HUF', extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: Math.random().toString(36).slice(2), date: '2026-09-01', type: 'expense',
  category, amount, currency: currency as LedgerEntry['currency'], note: '', ...extra,
})
const mkState = (partial: Partial<TripState> = {}, meta: Partial<TripState['meta']> = {}): TripState => ({
  meta: {
    version: 1, tripName: 't', travelers: 2, baseCurrency: 'HUF', budgetCap: 0,
    startDate: '2026-08-31', endDate: '2026-09-28', ...meta,
  },
  rates: { HUF: 1, THB: 9.4, USD: 311 } as TripState['rates'],
  segments: [
    seg('bkk', 'Thailand', '2026-08-31', '2026-09-07'),
    seg('cnx', 'Thailand', '2026-09-07', '2026-09-12'),
    seg('han', 'Vietnam', '2026-09-12', '2026-09-28'),
    seg('alt', 'Laos', '2026-09-14', '2026-09-18', { include: false }), // parked
  ],
  stays: [], transport: [], extras: [], notes: {},
  ...partial,
})

test('phase mirrors LiveClient: pre / live / post on the same boundaries', () => {
  const s = mkState()
  assert.equal(tripPhase(s, '2026-08-30'), 'pre')
  assert.equal(tripPhase(s, '2026-08-31'), 'live') // departure day IS the trip
  assert.equal(tripPhase(s, '2026-09-28'), 'live') // end date inclusive
  assert.equal(tripPhase(s, '2026-09-29'), 'post')
})

test('open-ended trips never report post — no honest "over" without an end', () => {
  const s = mkState({}, { endDate: undefined })
  assert.equal(tripPhase(s, '2027-06-01'), 'live')
})

test('recap counts days, in-plan stops and nights per country', () => {
  const r = tripRecap(mkState(), [])
  assert.equal(r.days, 29) // Aug 31 → Sep 28, Day 1 = departure day
  assert.equal(r.stops, 3) // parked alternative is not part of the trip story
  assert.deepEqual(r.countries, [
    { country: 'Vietnam', nights: 16, stops: 1 },
    { country: 'Thailand', nights: 12, stops: 2 },
  ])
})

test('money converts to base and splits by category, income nets out', () => {
  const ledger: LedgerEntry[] = [
    exp(10_000, 'food'),
    exp(1_000, 'food', 'THB'),           // 9 400 HUF
    exp(20_000, 'stay'),
    { ...exp(5_000, 'work'), type: 'income' },
  ]
  const r = tripRecap(mkState(), ledger)
  assert.equal(r.spent, 39_400)
  assert.equal(r.income, 5_000)
  assert.equal(r.net, 34_400)
  assert.deepEqual(r.spendByCategory, [
    { category: 'stay', amount: 20_000 },
    { category: 'food', amount: 19_400 },
  ])
})

test('budget cap: leftOfCap is signed, and null when no cap was set', () => {
  const capped = tripRecap(mkState({}, { budgetCap: 30_000 }), [exp(39_400, 'food')])
  assert.equal(capped.leftOfCap, -9_400) // over budget, honestly negative
  const uncapped = tripRecap(mkState(), [exp(39_400, 'food')])
  assert.equal(uncapped.leftOfCap, null)
})

test('open-ended recap length falls back to planned nights', () => {
  const r = tripRecap(mkState({}, { endDate: undefined }), [])
  assert.equal(r.days, 29) // 12 + 16 in-plan nights + 1
})
