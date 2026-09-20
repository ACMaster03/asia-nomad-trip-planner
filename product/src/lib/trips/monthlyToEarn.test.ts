import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthlyToEarn, nightsByMonth, type MonthActual, type MonthOut } from './spending.ts'
import type { Segment } from './types.ts'

const out = (key: string, total: number): MonthOut =>
  ({ key, stays: 0, living: 0, transport: 0, subs: 0, total })
const act = (key: string, spent: number): MonthActual => ({ key, spent, earned: 0, net: -spent })

test('months already behind you are not money you can still earn', () => {
  const r = monthlyToEarn([out('2026-08', 500), out('2026-09', 300), out('2026-10', 400)], [], [], '2026-09-15')
  assert.deepEqual(r.months.map((m) => m.key), ['2026-09', '2026-10'])
})

test('the current month is net of what has already left it', () => {
  const r = monthlyToEarn([out('2026-09', 1000), out('2026-10', 400)], [act('2026-09', 600)], [], '2026-09-15')
  assert.deepEqual(r.months, [
    { key: '2026-09', amount: 400, where: [] },
    { key: '2026-10', amount: 400, where: [] },
  ])
})

test('a month already overspent needs nothing further, and never goes negative', () => {
  const r = monthlyToEarn([out('2026-09', 1000)], [act('2026-09', 1400)], [], '2026-09-15')
  assert.deepEqual(r.months, [{ key: '2026-09', amount: 0, where: [] }])
  assert.equal(r.total, 0)
})

test('the average is the remaining total over the remaining months', () => {
  const r = monthlyToEarn([out('2026-09', 600), out('2026-10', 400), out('2026-11', 200)], [act('2026-09', 0)], [], '2026-09-15')
  assert.equal(r.total, 1200)
  assert.equal(r.average, 400)
})

test('only past months left is an empty list, not a divide by zero', () => {
  const r = monthlyToEarn([out('2026-08', 500)], [], [], '2026-09-15')
  assert.deepEqual(r.months, [])
  assert.equal(r.average, 0)
  assert.equal(r.total, 0)
})

test('months come back in calendar order across a year boundary', () => {
  const r = monthlyToEarn([out('2027-01', 1), out('2026-12', 2), out('2026-11', 3)], [], [], '2026-11-01')
  assert.deepEqual(r.months.map((m) => m.key), ['2026-11', '2026-12', '2027-01'])
})

const seg = (city: string, arrive: string, depart: string): Segment =>
  ({ id: city, country: 'X', city, arrive, depart }) as Segment

test('a stop that straddles a month splits its nights between the two', () => {
  const n = nightsByMonth([seg('Hanoi', '2026-09-28', '2026-10-04')])
  // 28, 29, 30 September; 1, 2, 3 October. Departure day belongs to nobody.
  assert.deepEqual(n['2026-09'], { Hanoi: 3 })
  assert.deepEqual(n['2026-10'], { Hanoi: 3 })
})

test('a month lists its cities, most nights first', () => {
  const r = monthlyToEarn(
    [out('2026-10', 1000)],
    [],
    [seg('Da Nang', '2026-10-01', '2026-10-06'), seg('Hanoi', '2026-10-06', '2026-10-18')],
    '2026-10-01',
  )
  assert.deepEqual(r.months[0].where, [
    { city: 'Hanoi', nights: 12 },
    { city: 'Da Nang', nights: 5 },
  ])
})

test('a stop with no depart, or departing before it arrives, is skipped rather than looping', () => {
  assert.deepEqual(nightsByMonth([seg('Bad', '2026-10-05', '2026-10-05')]), {})
  assert.deepEqual(nightsByMonth([seg('Worse', '2026-10-09', '2026-10-02')]), {})
})

test('a long stay spans its months whole, and a handover leaves one night behind', () => {
  // The real trip's shape: Bangkok, then two months in Hanoi, then on.
  const n = nightsByMonth([
    seg('Bangkok', '2026-08-31', '2026-09-30'),
    seg('Hanoi', '2026-09-30', '2026-11-30'),
    seg('Da Nang', '2026-11-30', '2026-12-14'),
  ])
  assert.deepEqual(n['2026-09'], { Bangkok: 29, Hanoi: 1 })
  assert.deepEqual(n['2026-10'], { Hanoi: 31 }) // a whole month in one place
  assert.deepEqual(n['2026-11'], { Hanoi: 29, 'Da Nang': 1 })
  // The arrival night is one night, singular — the card says "1 night in X".
  assert.equal(n['2026-08'].Bangkok, 1)
})
