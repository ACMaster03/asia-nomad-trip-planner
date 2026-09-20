import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthlyToEarn, nightsByMonth, type MonthActual, type MonthOut } from './spending.ts'
import { whereLine } from './format.ts'
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

test('a month lists its cities in the order you reach them, not by size', () => {
  const r = monthlyToEarn(
    [out('2026-10', 1000)],
    [],
    [seg('Da Nang', '2026-10-01', '2026-10-06'), seg('Hanoi', '2026-10-06', '2026-10-18')],
    '2026-10-01',
  )
  assert.deepEqual(r.months[0].where, [
    { city: 'Da Nang', nights: 5 },
    { city: 'Hanoi', nights: 12 },
  ])
})

test('stops handed in out of order are still replayed in travel order', () => {
  // inPlan is sorted before it gets here, but nightsByMonth does not take that
  // on trust: the key order IS the reading order of the card.
  const n = nightsByMonth([seg('Hanoi', '2026-10-06', '2026-10-18'), seg('Da Nang', '2026-10-01', '2026-10-06')])
  assert.deepEqual(Object.keys(n['2026-10']), ['Da Nang', 'Hanoi'])
})

test("December reads as the journey it is - the reported bug", () => {
  // One handover night in Hanoi, a fortnight in Da Nang, then Hong Kong. Size
  // order put Hong Kong ahead of Hanoi, which is not the order they happen in.
  const where = monthlyToEarn(
    [out('2026-12', 1000)],
    [],
    [
      seg('Hanoi', '2026-11-30', '2026-12-02'),
      seg('Da Nang', '2026-12-02', '2026-12-15'),
      seg('Hong Kong', '2026-12-15', '2026-12-19'),
    ],
    '2026-12-01',
  ).months[0].where
  assert.deepEqual(where, [
    { city: 'Hanoi', nights: 1 },
    { city: 'Da Nang', nights: 13 },
    { city: 'Hong Kong', nights: 4 },
  ])
  assert.equal(whereLine(where), '1 night in Hanoi, 13 in Da Nang, 4 in Hong Kong')
})

test('a month of constant moving keeps its three longest stays, still in order', () => {
  // Choosing by size and printing by date are separate steps: the one-night
  // stops are dropped, and the three that survive stay in travel order.
  const where = [
    { city: 'Hanoi', nights: 1 },
    { city: 'Hue', nights: 6 },
    { city: 'Da Nang', nights: 1 },
    { city: 'Hoi An', nights: 9 },
    { city: 'Hong Kong', nights: 4 },
  ]
  assert.equal(whereLine(where), '6 nights in Hue, 9 in Hoi An, 4 in Hong Kong, +2 more')
})

test('cities tied on nights keep the order you reached them in', () => {
  const where = [
    { city: 'Hue', nights: 2 },
    { city: 'Hoi An', nights: 2 },
    { city: 'Da Nang', nights: 2 },
    { city: 'Hanoi', nights: 2 },
  ]
  assert.equal(whereLine(where), '2 nights in Hue, 2 in Hoi An, 2 in Da Nang, +1 more')
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
