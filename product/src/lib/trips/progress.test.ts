import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tripDay, tripLength, stopProgress, offRoutePlace } from './progress.ts'
import type { Segment } from './types.ts'

const seg: Segment = { id: 'bkk', country: 'Thailand', city: 'Bangkok', arrive: '2026-09-01', depart: '2026-09-30' }

test('the 11 September screenshots agree once both screens share the math', () => {
  const meta = { startDate: '2026-08-31', endDate: '2027-04-30' }
  assert.equal(tripDay(meta, '2026-09-11'), 12)
  assert.equal(tripLength(meta, 73), 243)
  assert.deepEqual(stopProgress(seg, '2026-09-11'), { night: 11, nights: 29, left: 18, pct: 38 })
})

test('day 1 is departure day, night 1 is arrival day', () => {
  assert.equal(tripDay({ startDate: '2026-08-31' }, '2026-08-31'), 1)
  assert.equal(tripDay({ startDate: '2026-08-31' }, '2026-08-30'), null)
  assert.equal(stopProgress(seg, '2026-09-01').night, 1)
})

test('open-ended trips fall back to planned nights; night clamps at the stop length', () => {
  assert.equal(tripLength({ startDate: '2026-08-31' }, 73), 73)
  assert.equal(tripLength({ startDate: '2026-08-31' }, 0), null)
  assert.deepEqual(stopProgress(seg, '2026-10-15'), { night: 29, nights: 29, left: 0, pct: 100 })
})

const hanoi = { city: 'Hanoi', arrive: '2026-09-30' }
const now = new Date('2026-10-01T03:00:00Z') // 10:00 in Hanoi, 1 Oct

test('a check-in from the stop you left is not a detour (1 Oct, the day after Bangkok → Hanoi)', () => {
  const bkk = { occurred_at: '2026-09-30T02:00:00Z', payload: { placeName: 'Bangkok' } }
  assert.equal(offRoutePlace(hanoi, bkk, now), null)
  const eve = { occurred_at: '2026-09-29T12:00:00Z', payload: { placeName: 'Bangkok' } }
  assert.equal(offRoutePlace(hanoi, eve, now), null)
})

test('a check-in elsewhere after the arrival day is off route; in the stop, or old, it is not', () => {
  const later = new Date('2026-10-02T03:00:00Z')
  const halong = { occurred_at: '2026-10-01T09:00:00Z', payload: { placeName: 'Ha Long Bay' } }
  assert.equal(offRoutePlace(hanoi, halong, later), 'Ha Long Bay')
  const oldQuarter = { occurred_at: '2026-10-01T09:00:00Z', payload: { placeName: 'Old Quarter, Hanoi' } }
  assert.equal(offRoutePlace(hanoi, oldQuarter, later), null)
  assert.equal(offRoutePlace(hanoi, halong, new Date('2026-10-04T03:00:00Z')), null)
  assert.equal(offRoutePlace(hanoi, { occurred_at: '2026-10-01T09:00:00Z', payload: {} }, later), null)
  assert.equal(offRoutePlace(undefined, halong, later), null)
})
