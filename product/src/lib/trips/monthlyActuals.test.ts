import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthlyActuals } from './spending.ts'
import type { LedgerEntry } from './types.ts'

const rates = { HUF: 1, THB: 10 }
const e = (date: string, type: 'expense' | 'income', amount: number, currency = 'HUF'): LedgerEntry =>
  ({ id: date + type + amount, date, type, category: 'x', amount, currency, note: '' }) as LedgerEntry

test('a month is what went out, what came in, and the difference', () => {
  const r = monthlyActuals([e('2026-09-03', 'expense', 100), e('2026-09-20', 'income', 250)], rates, '2026-09-30')
  assert.deepEqual(r.months, [{ key: '2026-09', spent: 100, earned: 250, net: 150 }])
  assert.deepEqual([r.spent, r.earned, r.net], [100, 250, 150])
})

test('a month that cost more than it brought in goes negative', () => {
  const r = monthlyActuals([e('2026-09-03', 'expense', 400), e('2026-09-20', 'income', 250)], rates, '2026-09-30')
  assert.equal(r.months[0].net, -150)
})

test('nothing dated after today counts: a scheduled charge is not money spent', () => {
  const r = monthlyActuals([e('2026-09-03', 'expense', 100), e('2026-09-28', 'expense', 900)], rates, '2026-09-20')
  assert.equal(r.months[0].spent, 100)
})

test('foreign currency is converted to base', () => {
  const r = monthlyActuals([e('2026-09-03', 'expense', 50, 'THB')], rates, '2026-09-30')
  assert.equal(r.months[0].spent, 500)
})

test('an empty month between two busy ones is still a row', () => {
  const r = monthlyActuals(
    [e('2026-09-03', 'expense', 100), e('2026-11-03', 'expense', 100)],
    rates,
    '2026-11-30',
  )
  assert.deepEqual(r.months.map((m) => m.key), ['2026-09', '2026-10', '2026-11'])
  assert.deepEqual(r.months[1], { key: '2026-10', spent: 0, earned: 0, net: 0 })
})

test('the run crosses a year boundary without skipping December', () => {
  const r = monthlyActuals(
    [e('2026-11-03', 'expense', 10), e('2027-01-03', 'expense', 10)],
    rates,
    '2027-02-01',
  )
  assert.deepEqual(r.months.map((m) => m.key), ['2026-11', '2026-12', '2027-01'])
})

test('no dated entries at all is an empty table, not a crash', () => {
  assert.deepEqual(monthlyActuals([], rates, '2026-09-30').months, [])
})
