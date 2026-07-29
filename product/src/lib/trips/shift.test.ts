import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shiftRemainingStops } from './shift.ts'
import type { TripState, Segment, TransportLeg, Stay } from './types.ts'

const seg = (id: string, arrive: string, depart: string, extra: Partial<Segment> = {}): Segment => ({
  id, country: 'TH', city: id, arrive, depart, ...extra,
})
const leg = (id: string, date: string | undefined, extra: Partial<TransportLeg> = {}): TransportLeg => ({
  id, type: 'flight', from: 'a', to: 'b', date, cur: 'HUF', price: 1000, ...extra,
})
const stay = (id: string, segId: string, extra: Partial<Stay> = {}): Stay => ({
  id, segId, name: id, cur: 'HUF', ppn: 100, include: true, ...extra,
})
const mkState = (partial: Partial<TripState>): TripState => ({
  meta: { version: 1, tripName: 't', travelers: 2, baseCurrency: 'HUF', budgetCap: 0, startDate: '2026-08-31' },
  rates: { HUF: 1 } as TripState['rates'],
  segments: [], stays: [], transport: [], extras: [], notes: {},
  ...partial,
})

// Scenario used throughout: mid-trip on Sep 10, currently in cnx
// (Sep 7 → Sep 12), bkk already done, cm and han still ahead.
const base = () => mkState({
  segments: [
    seg('bkk', '2026-08-31', '2026-09-07'),
    seg('cnx', '2026-09-07', '2026-09-12'),
    seg('cm', '2026-09-12', '2026-09-20'),
    seg('han', '2026-09-20', '2026-09-28'),
  ],
})

test('staying 3 more days: current stop extends, the rest slide, history stays', () => {
  const r = shiftRemainingStops(base(), '2026-09-10', 3)
  const by = Object.fromEntries(r.state.segments.map((s) => [s.id, s]))
  assert.deepEqual([by.bkk.arrive, by.bkk.depart], ['2026-08-31', '2026-09-07']) // done — untouched
  assert.deepEqual([by.cnx.arrive, by.cnx.depart], ['2026-09-07', '2026-09-15']) // extended only
  assert.deepEqual([by.cm.arrive, by.cm.depart], ['2026-09-15', '2026-09-23'])
  assert.deepEqual([by.han.arrive, by.han.depart], ['2026-09-23', '2026-10-01'])
  assert.equal(r.extended, 'cnx')
  assert.deepEqual(r.shifted, ['cm', 'han'])
})

test('input state is never mutated', () => {
  const s = base()
  const snapshot = JSON.stringify(s)
  shiftRemainingStops(s, '2026-09-10', 3)
  assert.equal(JSON.stringify(s), snapshot)
})

test('leaving early: negative shift never departs before the pivot', () => {
  const r = shiftRemainingStops(base(), '2026-09-10', -4)
  const by = Object.fromEntries(r.state.segments.map((s) => [s.id, s]))
  assert.equal(by.cnx.depart, '2026-09-10') // clamped to the pivot, not Sep 8
  assert.deepEqual([by.cm.arrive, by.cm.depart], ['2026-09-08', '2026-09-16'])
})

test('zero days or an invalid pivot is a no-op with an empty report', () => {
  for (const r of [shiftRemainingStops(base(), '2026-09-10', 0), shiftRemainingStops(base(), 'nope', 3)]) {
    assert.deepEqual(r.state, base())
    assert.deepEqual(r.shifted, [])
    assert.equal(r.extended, null)
  }
})

test('parked alternatives (include:false) are not "the remaining stops"', () => {
  const s = base()
  s.segments.push(seg('alt', '2026-09-14', '2026-09-18', { include: false }))
  const r = shiftRemainingStops(s, '2026-09-10', 3)
  const alt = r.state.segments.find((x) => x.id === 'alt')!
  assert.deepEqual([alt.arrive, alt.depart], ['2026-09-14', '2026-09-18'])
})

test('idea/shortlist transport slides, booked transport is pinned and reported', () => {
  const s = base()
  s.transport = [
    leg('idea-leg', '2026-09-12', { status: 'idea' }),
    leg('booked-leg', '2026-09-20', { status: 'booked' }),
    leg('done-leg', '2026-09-07', { status: 'booked' }), // before pivot — irrelevant
  ]
  const r = shiftRemainingStops(s, '2026-09-10', 3)
  const by = Object.fromEntries(r.state.transport.map((t) => [t.id, t]))
  assert.equal(by['idea-leg'].date, '2026-09-15')
  assert.equal(by['booked-leg'].date, '2026-09-20') // did not move
  assert.deepEqual(r.shiftedTransport, ['idea-leg'])
  assert.deepEqual(r.pinnedTransport.map((t) => t.id), ['booked-leg'])
})

test('booked stays on moved segments are reported, never rewritten', () => {
  const s = base()
  s.stays = [
    stay('cm-hotel', 'cm', { status: 'booked', cancelUntil: '2026-09-10' }),
    stay('bkk-hotel', 'bkk', { status: 'booked' }), // history — not reported
    stay('han-idea', 'han', { status: 'idea' }),    // not committed — not reported
  ]
  const r = shiftRemainingStops(s, '2026-09-10', 3)
  assert.deepEqual(r.pinnedStays.map((st) => st.id), ['cm-hotel'])
  assert.deepEqual(r.state.stays, s.stays) // stays byte-identical
})

test('overrun against a fixed end date is measured, not silently absorbed', () => {
  const s = base()
  s.meta.endDate = '2026-09-30'
  const r = shiftRemainingStops(s, '2026-09-10', 3) // han now departs Oct 1
  assert.equal(r.overrunDays, 1)
  const fits = shiftRemainingStops(s, '2026-09-10', 1) // han departs Sep 29
  assert.equal(fits.overrunDays, 0)
})

test('open-ended trips (no endDate) never report overrun', () => {
  const r = shiftRemainingStops(base(), '2026-09-10', 30)
  assert.equal(r.overrunDays, 0)
})
