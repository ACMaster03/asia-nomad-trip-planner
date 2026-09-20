import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthlyToEarn, type MonthActual, type MonthOut } from './spending.ts'

// The nights-per-city tests that used to live here went with the month rows
// they described (2026-09-20). What survives is the arithmetic the headline
// still rests on: which months count, and what the average is over.

const out = (key: string, total: number): MonthOut =>
  ({ key, stays: 0, living: 0, transport: 0, subs: 0, total })
const act = (key: string, spent: number): MonthActual => ({ key, spent, earned: 0, net: -spent })

test('months already behind you are not money you can still earn', () => {
  const r = monthlyToEarn([out('2026-08', 500), out('2026-09', 300), out('2026-10', 400)], [], '2026-09-15')
  assert.deepEqual(r.months.map((m) => m.key), ['2026-09', '2026-10'])
})

test('the current month is net of what has already left it', () => {
  const r = monthlyToEarn([out('2026-09', 1000), out('2026-10', 400)], [act('2026-09', 600)], '2026-09-15')
  assert.deepEqual(r.months, [
    { key: '2026-09', amount: 400 },
    { key: '2026-10', amount: 400 },
  ])
})

test('a month already overspent needs nothing further, and never goes negative', () => {
  const r = monthlyToEarn([out('2026-09', 1000)], [act('2026-09', 1400)], '2026-09-15')
  assert.deepEqual(r.months, [{ key: '2026-09', amount: 0 }])
  assert.equal(r.total, 0)
})

test('the average is the remaining total over the remaining months', () => {
  const r = monthlyToEarn([out('2026-09', 600), out('2026-10', 400), out('2026-11', 200)], [act('2026-09', 0)], '2026-09-15')
  assert.equal(r.total, 1200)
  assert.equal(r.average, 400)
})

test('the average is a middle no single month has to look like', () => {
  // The card shows only the average now, so this is the shape that is no longer
  // visible anywhere: four months averaging 400 where one of them needs 1000.
  const r = monthlyToEarn(
    [out('2026-09', 1000), out('2026-10', 200), out('2026-11', 200), out('2026-12', 200)],
    [],
    '2026-09-01',
  )
  assert.equal(r.average, 400)
  assert.equal(Math.max(...r.months.map((m) => m.amount)), 1000)
})

test('only past months left is an empty list, not a divide by zero', () => {
  const r = monthlyToEarn([out('2026-08', 500)], [], '2026-09-15')
  assert.deepEqual(r.months, [])
  assert.equal(r.average, 0)
  assert.equal(r.total, 0)
})

test('months come back in calendar order across a year boundary', () => {
  const r = monthlyToEarn([out('2027-01', 1), out('2026-12', 2), out('2026-11', 3)], [], '2026-11-01')
  assert.deepEqual(r.months.map((m) => m.key), ['2026-11', '2026-12', '2027-01'])
})
