import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allOverlaps, formatOverlap, formatRange, meetupKey, meetupQueue, overlappingNow, overlaps, peopleByCity, stopOn } from './people.ts'
import type { City } from '../catalogue/types.ts'
import type { Segment } from '../trips/types.ts'
import type { SharedRouteStop } from '../follow/api.ts'
import type { FollowedPerson, FollowedSummary } from '../follow/follows.ts'

const TODAY = '2026-09-18'
const city = (name: string, country: string, lat: number, lng: number): City =>
  ({ id: name.length, country, city: name, region: 'sea', region_name: null, lat, lng, daily_living_mid: null, accom_mid: null, rent_monthly: null, attributes: {} })
const CITIES = [city('Hanoi', 'Vietnam', 21.03, 105.85), city('Da Nang', 'Vietnam', 16.05, 108.2), city('Bangkok', 'Thailand', 13.76, 100.5)]
const seg = (c: string, arrive: string, depart: string, extra: Partial<Segment> = {}): Segment => ({ id: c, country: c === 'Bangkok' ? 'Thailand' : 'Vietnam', city: c, arrive, depart, ...extra })
const stop = (c: string, arrive: string, depart: string, lat: number | null = 1, lng: number | null = 2): SharedRouteStop => ({ city: c, country: 'Vietnam', arrive, depart, lat, lng })
const MINE = [seg('Bangkok', '2026-09-01', '2026-09-30'), seg('Hanoi', '2026-09-30', '2026-11-13'), seg('Da Nang', '2026-11-13', '2026-12-13')]

const person = (user_id: string, name: string, trip_id: string, currentCity: string | null, state: 'on' | 'paused' = 'on'): FollowedPerson => ({
  user_id, name, followedAt: '2026-01-01',
  trips: [{ trip_id, tripName: `${name}'s trip`, startDate: '2026-09-01', endDate: null, state, travellers: [{ id: user_id, name }], currentCity, currentCountry: currentCity ? 'Vietnam' : null, lastEventAt: null, lastSeenCity: currentCity }],
})
const summary = (route: SharedRouteStop[]): FollowedSummary => ({ tripName: 't', startDate: '2026-09-01', endDate: null, route, travellers: [], following: [] })

test('overlaps: same city, intersecting dates, today or later', () => {
  const theirs = [stop('Hanoi', '2026-10-12', '2026-10-15'), stop('Hue', '2026-10-15', '2026-10-20'), stop('Da Nang', '2026-12-10', '2026-12-20')]
  assert.deepEqual(overlaps(MINE, theirs, TODAY), [
    { city: 'Hanoi', country: 'Vietnam', start: '2026-10-12', end: '2026-10-15' },
    { city: 'Da Nang', country: 'Vietnam', start: '2026-12-10', end: '2026-12-13' },
  ])
})

test('overlaps: a past overlap and an excluded stop are ignored; the depart day counts', () => {
  const mine = [seg('Bangkok', '2026-09-01', '2026-09-10'), seg('Hanoi', '2026-09-30', '2026-11-13', { include: false })]
  assert.deepEqual(overlaps(mine, [stop('Bangkok', '2026-09-05', '2026-09-08'), stop('Hanoi', '2026-10-01', '2026-10-02')], TODAY), [])
  assert.deepEqual(overlaps(MINE, [stop('Bangkok', '2026-09-30', '2026-10-05')], TODAY), [
    { city: 'Bangkok', country: 'Thailand', start: '2026-09-30', end: '2026-09-30' },
  ])
})

test('overlaps: city names match the way the route builder matches them', () => {
  assert.equal(overlaps(MINE, [stop('hanoi (Old Quarter)', '2026-10-01', '2026-10-03')], TODAY).length, 1)
})

test('peopleByCity: groups by city, coordinates from the catalogue first, then the route', () => {
  const following = [person('a', 'Anna', 'tA', 'Hanoi'), person('t', 'Tom', 'tA', 'Hanoi'), person('m', 'Mari', 'tM', 'Hue'), person('p', 'Pau', 'tP', 'Kyoto'), person('e', 'Eva', 'tE', null)]
  const summaries = { tA: summary([stop('Hanoi', '2026-09-10', '2026-09-20')]), tM: summary([stop('Hue', '2026-09-15', '2026-09-25', 16.4, 107.6)]) }
  const groups = peopleByCity(following, CITIES, summaries, TODAY)
  assert.deepEqual(groups.map((g) => [g.city, g.people.map((p) => p.name)]), [['Hanoi', ['Anna', 'Tom']], ['Hue', ['Mari']]])
  assert.deepEqual([groups[0].lat, groups[0].lng], [21.03, 105.85])
  assert.deepEqual([groups[1].lat, groups[1].lng], [16.4, 107.6])
  assert.equal(groups[0].people[0].until, '2026-09-20')
  assert.equal(groups[1].people[0].until, '2026-09-25')
})

test('peopleByCity: a paused trip and an unknown city draw nothing', () => {
  assert.deepEqual(peopleByCity([person('a', 'Anna', 'tA', 'Hanoi', 'paused'), person('b', 'Bo', 'tB', 'Nowhere')], CITIES, {}, TODAY), [])
})

test('allOverlaps: every followed open trip, soonest first, only with a loaded summary', () => {
  const following = [person('a', 'Anna', 'tA', 'Hanoi'), person('e', 'Eva', 'tE', null)]
  const summaries = { tA: summary([stop('Da Nang', '2026-11-20', '2026-11-25')]), tE: summary([stop('Hanoi', '2026-10-01', '2026-10-04')]) }
  assert.deepEqual(allOverlaps(MINE, following, summaries, TODAY).map((o) => [o.names, o.city, o.start]), [[['Eva'], 'Hanoi', '2026-10-01'], [['Anna'], 'Da Nang', '2026-11-20']])
  assert.deepEqual(allOverlaps(MINE, following, { tA: undefined }, TODAY), [])
})

test('allOverlaps: two travellers on one trip share a line', () => {
  const following = [person('t', 'Tom', 'tA', 'Hanoi'), person('a', 'Anna', 'tA', 'Hanoi')]
  const rows = allOverlaps(MINE, following, { tA: summary([stop('Hanoi', '2026-10-12', '2026-10-15')]) }, TODAY)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].names, ['Anna', 'Tom'])
  assert.equal(formatOverlap(rows[0], rows[0].names, TODAY), 'You, Anna and Tom are all in Hanoi, 12–15 Oct')
  assert.equal(formatOverlap(rows[0], ['Anna', 'Bo', 'Tom'], TODAY), 'You, Anna, Bo and Tom are all in Hanoi, 12–15 Oct')
})

test('formatting: ranges and the overlap line', () => {
  assert.equal(formatRange('2026-10-12', '2026-10-15'), '12–15 Oct')
  assert.equal(formatRange('2026-09-28', '2026-10-03'), '28 Sept – 3 Oct')
  assert.equal(formatRange('2026-10-12', '2026-10-12'), '12 Oct')
  const o = { city: 'Hanoi', country: 'Vietnam', start: '2026-10-12', end: '2026-10-15' }
  assert.equal(formatOverlap(o, 'Anna', TODAY), 'You and Anna are both in Hanoi, 12–15 Oct')
  assert.equal(formatOverlap({ ...o, end: '2026-10-12' }, 'Anna', TODAY), 'You and Anna are both in Hanoi on 12 Oct')
  assert.equal(formatOverlap(o, 'Anna', '2026-10-13'), 'You and Anna are both in Hanoi until 15 Oct')
})

test('stopOn: the stop covering today', () => {
  assert.equal(stopOn([stop('A', '2026-09-10', '2026-09-18'), stop('B', '2026-09-18', '2026-09-25')], TODAY)?.city, 'B')
  assert.equal(stopOn([stop('A', '2026-09-10', '2026-09-12')], TODAY), null)
})

test('Home: only the touches happening today, dismissed ones skipped, three at a time', () => {
  const row = (trip_id: string, city: string, start: string, end: string) => ({ trip_id, names: ['A'], city, country: 'X', start, end })
  const rows = [row('t1', 'Hanoi', '2026-09-10', '2026-09-20'), row('t2', 'Hanoi', '2026-09-18', '2026-09-18'), row('t3', 'Hue', '2026-09-19', '2026-09-22'), row('t4', 'Hoi An', '2026-09-01', '2026-09-30'), row('t5', 'Da Nang', '2026-09-17', '2026-09-19')]
  const now = overlappingNow(rows, TODAY)
  assert.deepEqual(now.map((o) => o.trip_id), ['t1', 't2', 't4', 't5'])
  assert.equal(meetupKey(rows[0]), 't1|hanoi')
  assert.deepEqual(meetupQueue(now, new Set(), 3).map((o) => o.trip_id), ['t1', 't2', 't4'])
  assert.deepEqual(meetupQueue(now, new Set(['t2|hanoi']), 3).map((o) => o.trip_id), ['t1', 't4', 't5'])
})
