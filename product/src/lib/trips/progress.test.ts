import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tripDay, tripLength, stopProgress } from './progress.ts'
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
