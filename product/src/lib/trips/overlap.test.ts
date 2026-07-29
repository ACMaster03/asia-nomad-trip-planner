import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findStopOverlaps, doubleCountedNights } from './overlap.ts'
import type { Segment } from './types.ts'

// Runs on Node's built-in runner with native type stripping (Node ≥ 22.7;
// this repo pins nothing older): `npm test` from product/.

const seg = (id: string, arrive: string, depart: string, extra: Partial<Segment> = {}): Segment => ({
  id, country: 'TH', city: id, arrive, depart, ...extra,
})

test('clean back-to-back itinerary has no overlaps', () => {
  const out = findStopOverlaps([
    seg('bkk', '2026-08-31', '2026-09-05'),
    seg('cnx', '2026-09-05', '2026-09-12'), // same-day handoff — travel day, not overlap
    seg('cm', '2026-09-12', '2026-09-20'),
  ])
  assert.deepEqual(out, [])
})

test('one shared night is caught with the exact night named', () => {
  const out = findStopOverlaps([
    seg('bkk', '2026-08-31', '2026-09-05'),
    seg('cnx', '2026-09-04', '2026-09-10'), // arrives a day before bkk departs
  ])
  assert.equal(out.length, 1)
  assert.deepEqual(out[0], {
    aId: 'bkk', bId: 'cnx', aCity: 'bkk', bCity: 'cnx',
    from: '2026-09-04', until: '2026-09-05', nights: 1,
  })
  assert.equal(doubleCountedNights([
    seg('bkk', '2026-08-31', '2026-09-05'),
    seg('cnx', '2026-09-04', '2026-09-10'),
  ]), 1)
})

test('containment counts the inner stop\'s full stay', () => {
  const out = findStopOverlaps([
    seg('bkk', '2026-08-31', '2026-09-30'),
    seg('side', '2026-09-10', '2026-09-13'), // side trip forgot to split the parent
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].nights, 3)
  assert.equal(out[0].from, '2026-09-10')
  assert.equal(out[0].until, '2026-09-13')
})

test('out-of-plan stops are ignored, like the budget ignores them', () => {
  const out = findStopOverlaps([
    seg('bkk', '2026-08-31', '2026-09-05'),
    seg('alt', '2026-09-01', '2026-09-04', { include: false }), // parked alternative
  ])
  assert.deepEqual(out, [])
})

test('invalid or zero-night stops never overlap', () => {
  const out = findStopOverlaps([
    seg('bkk', '2026-08-31', '2026-09-05'),
    seg('tbd', '', ''),                          // dates not set yet
    seg('bad', '2026-09-02', 'not-a-date'),      // malformed
    seg('zero', '2026-09-02', '2026-09-02'),     // zero nights
    seg('neg', '2026-09-04', '2026-09-01'),      // depart before arrive
  ])
  assert.deepEqual(out, [])
})

test('a nights override does not hide a calendar overlap', () => {
  // the budget may count 2 nights via override, but the calendar still says
  // these two stops claim the same bed-nights
  const out = findStopOverlaps([
    seg('bkk', '2026-08-31', '2026-09-05', { nights: 2 }),
    seg('cnx', '2026-09-03', '2026-09-08'),
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].nights, 2)
})

test('three stops on one night → two overlap pairs (matches double-added money)', () => {
  const segs = [
    seg('a', '2026-09-01', '2026-09-03'),
    seg('b', '2026-09-02', '2026-09-04'),
    seg('c', '2026-09-02', '2026-09-05'),
  ]
  const out = findStopOverlaps(segs)
  // a∩b (Sep 2), a∩c (Sep 2), b∩c (Sep 2–3)
  assert.equal(out.length, 3)
  assert.equal(doubleCountedNights(segs), 4)
})

test('ordering is by earlier arrival regardless of input order', () => {
  const out = findStopOverlaps([
    seg('late', '2026-09-04', '2026-09-08'),
    seg('early', '2026-09-01', '2026-09-05'),
  ])
  assert.equal(out[0].aId, 'early')
  assert.equal(out[0].bId, 'late')
})
