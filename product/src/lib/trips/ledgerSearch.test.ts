import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchLedger } from './ledgerSearch.ts'
import type { LedgerEntry } from './types.ts'

const e = (id: string, date: string, amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id, date, type: 'expense', category: 'food', amount, currency: 'HUF', note: '', ...extra })
const rates = { HUF: 1, USD: 340 }
const TODAY = '2026-09-24'

const ledger = [
  e('icloud-aug', '2026-08-14', 3290, { category: 'subscriptions', note: 'iCloud 2 TB' }),
  e('icloud-sep', '2026-09-14', 3290, { category: 'subscriptions', note: 'iCloud 2 TB' }),
  e('pho', '2026-09-20', 1200, { note: 'Phở Thìn' }),
  e('lunch', '2026-09-21', 2400),
  e('hostel', '2026-10-02', 40, { currency: 'USD', category: 'stays', note: 'Hanoi hostel', source: { kind: 'stay', id: 'st4' } }),
  e('invoice', '2026-09-10', 150_000, { type: 'income', category: 'freelance', note: 'Invoice, Hanoi client' }),
]

test('an empty query shows the whole list', () => {
  assert.equal(searchLedger(ledger, rates, '', TODAY), null)
  assert.equal(searchLedger(ledger, rates, '   ', TODAY), null)
})

test('finds a name in any case, newest first, with what the matches spent', () => {
  const r = searchLedger(ledger, rates, 'icloud', TODAY)!
  assert.deepEqual(r.past.map((x) => x.id), ['icloud-sep', 'icloud-aug'])
  assert.equal(r.spent, 6580)
  assert.equal(r.received, 0)
})

test('every word counts, in any order, and accents do not', () => {
  assert.deepEqual(searchLedger(ledger, rates, 'tb icloud', TODAY)!.past.map((x) => x.id), ['icloud-sep', 'icloud-aug'])
  assert.deepEqual(searchLedger(ledger, rates, 'icloud netflix', TODAY)!.past, [])
  assert.deepEqual(searchLedger(ledger, rates, 'pho thin', TODAY)!.past.map((x) => x.id), ['pho'])
  assert.deepEqual(searchLedger([e('bus', '2026-09-18', 9000, { note: 'Bus to Đà Nẵng' })], rates, 'da nang', TODAY)!.past.map((x) => x.id), ['bus'])
})

test('an entry without a name is found by the category it shows instead', () => {
  assert.deepEqual(searchLedger(ledger, rates, 'food', TODAY)!.past.map((x) => x.id), ['lunch', 'pho'])
})

test('a scheduled match is listed after the logged ones and not counted; income is counted apart', () => {
  const r = searchLedger(ledger, rates, 'hanoi', TODAY)!
  assert.deepEqual(r.past.map((x) => x.id), ['invoice'])
  assert.deepEqual(r.scheduled.map((x) => x.id), ['hostel'])
  assert.equal(r.spent, 0)
  assert.equal(r.received, 150_000)
})
