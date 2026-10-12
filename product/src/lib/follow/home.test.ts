import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anyLive, firstSentence, fromLabel, journeyCards, journeyLine, names, stopIndexOf, whenLabel } from './home.ts'
import type { FollowedEvent, FollowedPerson, FollowedSummary, FollowedTripCard } from './follows.ts'

const card = (over: Partial<FollowedTripCard>): FollowedTripCard => ({
  trip_id: 't', tripName: 'Asia', startDate: '2026-09-01', endDate: '2026-12-01', state: 'on',
  travellers: [{ id: 'a', name: 'Anna' }], currentCity: 'Hanoi', currentCountry: 'Vietnam', lastEventAt: null, lastSeenCity: null, ...over,
})
const person = (name: string, trips: FollowedTripCard[]): FollowedPerson => ({ user_id: name, name, followedAt: '', trips })
const summary: FollowedSummary = {
  tripName: 'Asia', startDate: '2026-09-01', endDate: '2026-12-01',
  route: [
    { city: 'Bangkok', country: 'Thailand', arrive: '2026-09-01', depart: '2026-09-30', lat: null, lng: null },
    { city: 'Hanoi', country: 'Vietnam', arrive: '2026-09-30', depart: '2026-11-13', lat: null, lng: null },
    { city: 'Da Nang', country: 'Vietnam', arrive: '2026-11-13', depart: '2026-12-01', lat: null, lng: null },
  ],
  legs: [{ from: 'Bangkok', to: 'Hanoi', date: '2026-09-30', mode: 'train' }],
  travellers: [{ id: 'a', name: 'Anna' }], following: ['a'],
}
const ev = (over: Partial<FollowedEvent>): FollowedEvent => ({
  id: 'e', kind: 'checkin', occurred_at: '2026-10-05T10:00:00Z', author: 'a', authorName: 'Anna',
  payload: { placeName: 'Café' }, rating: null, comment: null, trip_id: 't', tripName: 'Asia', ...over,
})

test('one card per journey, live first, then upcoming, finished, paused', () => {
  const live = card({ trip_id: 'live' })
  const soon = card({ trip_id: 'soon', startDate: '2026-11-01', endDate: null })
  const done = card({ trip_id: 'done', startDate: '2026-01-01', endDate: '2026-02-01' })
  const paused = card({ trip_id: 'paused', state: 'paused' })
  const cards = journeyCards([person('Anna', [done, live]), person('Tom', [live, paused, soon])], '2026-10-12')
  assert.deepEqual(cards.map((c) => c.trip_id), ['live', 'soon', 'done', 'paused'])
  assert.equal(anyLive([person('Tom', [soon, done])], '2026-10-12'), false)
  assert.equal(anyLive([person('Tom', [live])], '2026-10-12'), true)
})

test('names read as a sentence', () => {
  assert.equal(names([]), '')
  assert.equal(names(['Anna']), 'Anna')
  assert.equal(names(['Patrik', 'Petra']), 'Patrik and Petra')
  assert.equal(names(['Patrik', 'Petra', 'Anna']), 'Patrik, Petra and Anna')
})

test('a post belongs to the stop of its day; an arrival to its city; a travel-day post before the arrival to the stop before', () => {
  const route = summary.route
  assert.equal(stopIndexOf(route, [], ev({ occurred_at: '2026-10-05T10:00:00Z' })), 1)
  assert.equal(stopIndexOf(route, [], ev({ kind: 'arrived', payload: { city: 'da nang' } })), 2)
  const arrived = ev({ id: 'arr', kind: 'arrived', payload: { city: 'Hanoi' }, occurred_at: '2026-09-30T14:00:00Z' })
  const early = ev({ occurred_at: '2026-09-30T08:00:00Z' })
  const late = ev({ occurred_at: '2026-09-30T18:00:00Z' })
  assert.equal(stopIndexOf(route, [arrived], early), 0)
  assert.equal(stopIndexOf(route, [arrived], late), 1)
})

test("the journey card's line", () => {
  const c = card({})
  assert.equal(journeyLine(c, summary, [], '2026-10-12'), 'Hanoi, day 42 · next Da Nang, 13 Nov')
  assert.equal(journeyLine(c, summary, [], '2026-08-20'), 'Leaves 1 Sep')
  assert.equal(journeyLine(c, summary, [], '2026-12-05'), 'Home again')
  assert.equal(journeyLine(card({ state: 'paused' }), summary, [], '2026-10-12'), null)
  assert.equal(journeyLine(c, null, [], '2026-10-12'), 'Hanoi')
  const arrived = ev({ kind: 'arrived', payload: { city: 'Hanoi' }, occurred_at: '2026-09-30T10:00:00Z' })
  assert.equal(journeyLine(c, summary, [arrived], '2026-09-30'), 'Hanoi, day 30 · arrived today by train')
  const gap: FollowedSummary = { ...summary, route: summary.route.slice(0, 1) }
  assert.equal(journeyLine(c, gap, [], '2026-10-12'), 'Day 42 · between stops')
})

test('"By train from Hanoi", and plain "From" without a mode', () => {
  assert.equal(fromLabel('Hanoi', 'train'), 'By train from Hanoi')
  assert.equal(fromLabel('Hanoi', 'other'), 'From Hanoi')
})

test('when: just now, minutes, hours, yesterday, then the date', () => {
  const now = Date.parse('2026-10-12T12:00:00Z')
  assert.equal(whenLabel('2026-10-12T11:59:30Z', now), 'just now')
  assert.equal(whenLabel('2026-10-12T11:40:00Z', now), '20 minutes ago')
  assert.equal(whenLabel('2026-10-12T09:00:00Z', now), '3 hours ago')
  assert.equal(whenLabel('2026-10-11T12:00:00Z', now), 'yesterday')
  assert.equal(whenLabel('2026-10-05T12:00:00Z', now), '5 Oct')
})

test('the first sentence of a quote, or a short cut', () => {
  assert.equal(firstSentence('Rainy and perfect. The train came through at seven.'), 'Rainy and perfect.')
  assert.equal(firstSentence('Short'), 'Short')
  assert.equal(firstSentence('x'.repeat(70)), 'x'.repeat(57) + '…')
  assert.equal(firstSentence('  '), null)
})
