import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ledgerView } from './ledgerView.ts'
import type { LedgerEntry } from './types.ts'

const e = (id: string, date: string, amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id, date, type: 'expense', category: 'food', amount, currency: 'HUF', note: '', ...extra })
const rates = { HUF: 1, USD: 340 }
const TODAY = '2026-09-23'

test('a scheduled stay folds away and no total counts it (the September of Petra\'s screenshot)', () => {
  const ledger = [
    e('stay', '2026-09-29', 1276, { currency: 'USD', category: 'stays', source: { kind: 'stay', id: 'st2' } }),
    e('breakfast', TODAY, 950),
    e('dinner', '2026-09-22', 4100),
    e('pack', '2026-08-20', 64_900),
  ]
  const v = ledgerView(ledger, rates, TODAY, '2026-08-31')
  assert.deepEqual(v.scheduled.map((x) => x.id), ['stay'])
  assert.equal(v.scheduledSpend, 1276 * 340)
  assert.deepEqual(v.past.map((x) => x.id), ['breakfast', 'dinner', 'pack'], 'newest first, starting today')
  assert.equal(v.byMonth['2026-09'], 950 + 4100, 'September counts only what is spent')
  assert.equal(v.byDay['2026-09-29'], undefined)
  assert.deepEqual([v.preCount, v.preTotal], [1, 64_900])
})

test('scheduled rows come soonest first, and today counts as spent', () => {
  const v = ledgerView([e('b', '2026-10-05', 10), e('a', '2026-09-24', 20), e('t', TODAY, 30)], rates, TODAY)
  assert.deepEqual(v.scheduled.map((x) => x.id), ['a', 'b'])
  assert.deepEqual(v.past.map((x) => x.id), ['t'])
})

test('with an income among the scheduled rows there is no single total to show', () => {
  const v = ledgerView([e('fee', '2026-10-01', 10), e('inv', '2026-10-02', 500, { type: 'income', category: 'freelance' })], rates, TODAY)
  assert.equal(v.scheduledSpend, null)
  assert.equal(v.scheduled.length, 2)
})
