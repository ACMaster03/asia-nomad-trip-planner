import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTimeline, stopCoverage, stayRange, stayMoneyState, legMoneyState, deadlinesMissing, shiftDepartures, homeCity } from './timeline.ts'
import { stayNights } from './format.ts'
import type { Segment, Stay, TransportLeg, TripState } from './types'

const seg = (id: string, city: string, arrive: string, depart: string, extra: Partial<Segment> = {}): Segment => ({ id, city, country: '', arrive, depart, ...extra })
const stay = (id: string, segId: string, extra: Partial<Stay> = {}): Stay => ({ id, segId, name: id, cur: 'USD', ppn: 30, include: true, ...extra })
const leg = (id: string, from: string, to: string, extra: Partial<TransportLeg> = {}): TransportLeg => ({ id, type: 'Flight', from, to, cur: 'USD', price: 100, include: true, ...extra })
const state = (over: Partial<TripState> = {}): TripState => ({
  meta: { version: 1, tripName: 'Asia', travelers: 2, baseCurrency: 'HUF', budgetCap: 0, startDate: '2026-08-31', endDate: '2027-04-30', homeBase: 'Budapest, Hungary' },
  rates: { HUF: 1, USD: 312.8 },
  segments: [seg('bkk', 'Bangkok', '2026-09-01', '2026-09-30'), seg('han', 'Hanoi', '2026-09-30', '2026-11-13'), seg('dad', 'Da Nang', '2026-11-13', '2026-12-13')],
  stays: [],
  transport: [],
  extras: [],
  notes: {},
  ...over,
})

test('homeCity keeps the city of a "City, Country" home base', () => {
  assert.equal(homeCity('Budapest, Hungary'), 'Budapest')
  assert.equal(homeCity(undefined), '')
})

test('stayNights: own dates win over the typed override and the stop', () => {
  const s = seg('x', 'X', '2026-09-01', '2026-09-30')
  assert.equal(stayNights(stay('a', 'x'), s), 29)
  assert.equal(stayNights(stay('b', 'x', { nights: 10 }), s), 10)
  assert.equal(stayNights(stay('c', 'x', { nights: 10, checkIn: '2026-09-01', checkOut: '2026-09-15' }), s), 14)
})

test('stayRange: dates, legacy night count from the arrival, or the whole stop', () => {
  const s = seg('x', 'X', '2026-09-01', '2026-09-30')
  assert.deepEqual(stayRange(stay('a', 'x'), s), { from: '2026-09-01', to: '2026-09-30', nights: 29 })
  assert.deepEqual(stayRange(stay('b', 'x', { nights: 10 }), s), { from: '2026-09-01', to: '2026-09-11', nights: 10 })
  assert.deepEqual(stayRange(stay('c', 'x', { checkIn: '2026-09-05', checkOut: '2026-09-08' }), s), { from: '2026-09-05', to: '2026-09-08', nights: 3 })
  assert.equal(stayRange(stay('d', 'x'), seg('y', 'Y', '', '')), null)
})

test('stopCoverage: a stop with no stay has no gaps; a partial stay leaves the rest as a gap', () => {
  const s = seg('dad', 'Da Nang', '2026-11-13', '2026-12-13')
  assert.deepEqual(stopCoverage(s, []).gaps, [])
  const one = stopCoverage(s, [stay('a', 'dad', { checkIn: '2026-11-13', checkOut: '2026-11-30' })])
  assert.deepEqual(one.gaps, [{ from: '2026-11-30', to: '2026-12-13', nights: 13 }])
  assert.deepEqual(one.overlaps, [])
})

test('stopCoverage: a gap between two stays, and an overlap when they share nights', () => {
  const s = seg('dad', 'Da Nang', '2026-11-13', '2026-12-13')
  const two = stopCoverage(s, [
    stay('b', 'dad', { checkIn: '2026-12-01', checkOut: '2026-12-13' }),
    stay('a', 'dad', { checkIn: '2026-11-13', checkOut: '2026-11-20' }),
  ])
  assert.deepEqual(two.covered.map((c) => c.stay.id), ['a', 'b'])
  assert.deepEqual(two.gaps, [{ from: '2026-11-20', to: '2026-12-01', nights: 11 }])
  const ov = stopCoverage(s, [
    stay('a', 'dad', { checkIn: '2026-11-13', checkOut: '2026-11-25' }),
    stay('b', 'dad', { checkIn: '2026-11-22', checkOut: '2026-12-13' }),
  ])
  assert.deepEqual(ov.gaps, [])
  assert.deepEqual(ov.overlaps, [{ from: '2026-11-22', to: '2026-11-25', nights: 3 }])
})

test('stopCoverage ignores stays that do not count', () => {
  const s = seg('dad', 'Da Nang', '2026-11-13', '2026-12-13')
  const c = stopCoverage(s, [stay('a', 'dad', { include: false, checkIn: '2026-11-13', checkOut: '2026-11-20' })])
  assert.equal(c.covered.length, 0)
  assert.deepEqual(c.gaps, [])
})

test('buildTimeline: home, the legs between stops, the way home, transport on its leg, orphans apart', () => {
  const tl = buildTimeline(state({
    transport: [
      leg('t1', 'Budapest', 'Bangkok', { status: 'booked', date: '2026-08-31' }),
      leg('t2', 'bangkok', 'Hanoi', { status: 'idea', price: 0 }),
      leg('t3', 'Hanoi', 'Saigon', { status: 'idea' }),
    ],
  }))
  assert.equal(tl.home, 'Budapest')
  assert.deepEqual(tl.legs.map((l) => `${l.from.city}>${l.to.city}`), ['Budapest>Bangkok', 'Bangkok>Hanoi', 'Hanoi>Da Nang', 'Da Nang>Budapest'])
  assert.deepEqual(tl.legs.map((l) => l.date), ['2026-09-01', '2026-09-30', '2026-11-13', '2026-12-13'])
  assert.equal(tl.legs[0].booked?.id, 't1')
  assert.equal(tl.legs[1].booked, null)
  assert.equal(tl.legs[1].transport[0].id, 't2')
  assert.deepEqual(tl.orphans.map((t) => t.id), ['t3'])
})

test('buildTimeline: without a home there are only the legs between stops; unticked stops are left out', () => {
  const tl = buildTimeline(state({ meta: { version: 1, tripName: 'x', travelers: 1, baseCurrency: 'HUF', budgetCap: 0, startDate: '' }, segments: [seg('a', 'A', '2026-01-01', '2026-01-05'), seg('m', 'Maybe', '2026-01-05', '2026-01-07', { include: false }), seg('b', 'B', '2026-01-07', '2026-01-09')] }))
  assert.equal(tl.home, '')
  assert.deepEqual(tl.legs.map((l) => `${l.from.city}>${l.to.city}`), ['A>B'])
  assert.deepEqual(tl.stops.map((s) => s.id), ['a', 'b'])
})

test('buildTimeline puts the booked entry first when a leg has several', () => {
  const tl = buildTimeline(state({ transport: [leg('i', 'Bangkok', 'Hanoi', { status: 'idea' }), leg('b', 'Bangkok', 'Hanoi', { status: 'booked' })] }))
  assert.deepEqual(tl.legs[1].transport.map((t) => t.id), ['b', 'i'])
})

test('money state lines: paid, charged on, at check-in, deadlines not set, idea', () => {
  const today = '2026-09-22'
  assert.deepEqual(stayMoneyState(stay('a', 'x', { status: 'chosen', chargeDate: '2026-07-09' }), today), { label: 'paid 9 Jul', tone: 'ok' })
  assert.deepEqual(stayMoneyState(stay('b', 'x', { status: 'booked', chargeDate: '2026-09-29' }), today), { label: 'card charged on 29 Sep', tone: 'warn' })
  assert.deepEqual(stayMoneyState(stay('c', 'x', { status: 'booked', chargeAtCheckIn: true }), today), { label: 'card charged at check-in', tone: 'warn' })
  assert.deepEqual(stayMoneyState(stay('d', 'x', { status: 'booked' }), today), { label: 'deadlines not set', tone: 'warn' })
  assert.deepEqual(stayMoneyState(stay('e', 'x', { status: 'shortlist' }), today), { label: 'idea', tone: 'muted' })
  assert.deepEqual(stayMoneyState(stay('f', 'x', { status: 'idea', ppn: 0 }), today), { label: 'idea · no price', tone: 'muted' })
  assert.deepEqual(legMoneyState(leg('l', 'A', 'B', { status: 'booked', date: '2026-08-31' }), today), { label: 'paid 31 Aug', tone: 'ok' })
  assert.deepEqual(legMoneyState(leg('m', 'A', 'B', { status: 'booked', date: '2026-09-30', chargeDate: '2026-10-01' }), today), { label: 'card charged on 1 Oct', tone: 'warn' })
  assert.deepEqual(legMoneyState(leg('n', 'A', 'B', { status: 'idea', price: 0 }), today), { label: 'idea · no price', tone: 'muted' })
})

test('deadlinesMissing: a booked stay needs an answer for both dates, explicit no counts as an answer', () => {
  assert.equal(deadlinesMissing(stay('a', 'x', { status: 'booked' })), true)
  assert.equal(deadlinesMissing(stay('b', 'x', { status: 'booked', cancelUntil: '2026-11-24', chargeAtCheckIn: true })), false)
  assert.equal(deadlinesMissing(stay('c', 'x', { status: 'booked', noFreeCancel: true, chargeDate: '2026-11-24' })), false)
  assert.equal(deadlinesMissing(stay('d', 'x', { status: 'booked', noFreeCancel: true })), true)
  assert.equal(deadlinesMissing(stay('e', 'x', { status: 'idea' })), false)
})

test('shiftDepartures moves only the entries leaving that city on the old date', () => {
  const t = [leg('a', 'Bangkok', 'Hanoi', { date: '2026-09-30' }), leg('b', 'Bangkok', 'Hanoi', { date: '2026-10-02' }), leg('c', 'Hanoi', 'Da Nang', { date: '2026-09-30' })]
  const out = shiftDepartures(t, 'Bangkok', '2026-09-30', '2026-10-01')
  assert.deepEqual(out.map((x) => x.date), ['2026-10-01', '2026-10-02', '2026-09-30'])
  assert.equal(shiftDepartures(t, 'Bangkok', '2026-09-30', '2026-09-30'), t)
})

test('a transport entry finds its leg when one name is the other plus a word: "Hong Kong" and "Hong Kong Island"', () => {
  const tl = buildTimeline(state({
    segments: [seg('han', 'Hanoi', '2026-09-30', '2026-12-02'), seg('hk', 'Hong Kong Island', '2026-12-02', '2026-12-10')],
    transport: [leg('f', 'Hanoi', 'Hong Kong', { status: 'booked', date: '2026-12-02' })],
  }))
  assert.equal(tl.orphans.length, 0)
  assert.equal(tl.legs.find((l) => l.to.city === 'Hong Kong Island')?.booked?.id, 'f')
})
