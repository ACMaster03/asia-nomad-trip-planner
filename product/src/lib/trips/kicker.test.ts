import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moneyKicker, tripKicker } from './kicker.ts'
import type { Segment } from './types'

const seg = (id: string, city: string, arrive: string, depart: string): Segment => ({ id, city, country: '', arrive, depart })
const meta = { startDate: '2026-08-31', endDate: '2027-04-30' }
const segs = [seg('a', 'Bangkok', '2026-09-01', '2026-09-30'), seg('b', 'Hanoi', '2026-09-30', '2026-11-13')]

test('tripKicker: the day and the stop, between stops, before and after', () => {
  assert.equal(tripKicker(meta, segs, '2026-10-14'), 'Day 45 · Hanoi, night 15')
  assert.equal(tripKicker(meta, segs, '2026-11-20'), 'Day 82 · between stops')
  assert.equal(tripKicker(meta, segs, '2026-08-20'), 'Leaves 31 Aug')
  assert.equal(tripKicker(meta, segs, '2027-05-02'), 'Home again')
  assert.equal(tripKicker({ startDate: '', endDate: '' }, segs, '2026-10-14'), '')
})

test('moneyKicker: the journey, then the kicker with its first letter lowered', () => {
  assert.equal(moneyKicker('Asia', 'Day 45 · Hanoi, night 15'), 'Asia · day 45 · Hanoi, night 15')
  assert.equal(moneyKicker('Asia', ''), 'Asia')
})
