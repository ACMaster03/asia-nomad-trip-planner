import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyFilter, countryChips, currentTrip, matchesSearch, rowFromFollower, rowFromFollowing } from './people.ts'
import { groupThread, countLive } from './thread.ts'
import type { FollowedPerson, FollowedTripCard } from './follows.ts'
import type { PostComment } from './social.ts'

function trip(over: Partial<FollowedTripCard>): FollowedTripCard {
  return {
    trip_id: 't',
    tripName: 'Japan, at last',
    startDate: '2026-09-05',
    endDate: '2026-09-29',
    state: 'on',
    travellers: [],
    currentCity: 'Kyoto',
    currentCountry: 'Japan',
    lastEventAt: '2026-09-16T07:10:00Z',
    lastSeenCity: 'Kyoto',
    ...over,
  }
}
function person(name: string, trips: FollowedTripCard[]): FollowedPerson {
  return { user_id: name.toLowerCase(), name, followedAt: '2026-09-01T00:00:00Z', trips }
}

const bence = rowFromFollowing(person('Bence', [trip({})]))
const dori = rowFromFollowing(person('Dóri', [trip({ trip_id: 'l', tripName: 'Lisbon winter', currentCity: 'Lisbon', currentCountry: 'Portugal' })]))
const mark = rowFromFollowing(person('Márk', [trip({ trip_id: 'a', tripName: 'Andes', state: 'paused', currentCity: null, currentCountry: null })]))
const zsofi = rowFromFollowing(person('Zsófi', []))
const rows = [zsofi, mark, dori, bence]

test('the live trip wins over a paused one, and an empty list gives no trip', () => {
  const paused = trip({ trip_id: 'p', state: 'paused', currentCity: null, currentCountry: null, startDate: '2026-10-01' })
  assert.equal(currentTrip([paused, trip({})])?.trip_id, 't')
  assert.equal(currentTrip([]), null)
  assert.equal(zsofi.state, null)
  assert.equal(mark.state, 'paused')
})

test('search matches names, cities, countries and trip names, without accents', () => {
  assert.ok(matchesSearch(bence, 'kyoto'))
  assert.ok(matchesSearch(bence, 'Japan'))
  assert.ok(matchesSearch(bence, 'japan bence'))
  assert.ok(matchesSearch(dori, 'dori'))
  assert.ok(matchesSearch(dori, 'lisbon winter'))
  assert.equal(matchesSearch(bence, 'lisbon'), false)
  assert.ok(matchesSearch(zsofi, ''))
})

test('country chips count only people on a live trip, most first', () => {
  const chips = countryChips([...rows, rowFromFollowing(person('Kata', [trip({ user_id: 'k' } as Partial<FollowedTripCard>)]))])
  assert.deepEqual(chips, [
    { country: 'Japan', count: 2 },
    { country: 'Portugal', count: 1 },
  ])
})

test('filters compose with search and the result is alphabetical', () => {
  assert.deepEqual(applyFilter(rows, { kind: 'all' }, '').map((r) => r.name), ['Bence', 'Dóri', 'Márk', 'Zsófi'])
  assert.deepEqual(applyFilter(rows, { kind: 'travelling' }, '').map((r) => r.name), ['Bence', 'Dóri'])
  assert.deepEqual(applyFilter(rows, { kind: 'country', country: 'Japan' }, '').map((r) => r.name), ['Bence'])
  assert.deepEqual(applyFilter(rows, { kind: 'travelling' }, 'lis').map((r) => r.name), ['Dóri'])
})

test('a follower row shows a location only when one was shared', () => {
  const f = rowFromFollower({ user_id: 'a', name: 'Ádám', followedAt: '', location: null })
  assert.equal(f.city, null)
  assert.equal(f.state, null)
  const g = rowFromFollower({ user_id: 'b', name: 'Bea', followedAt: '', location: { trip_id: 'x', tripName: 'Bali', city: 'Canggu', country: 'Indonesia' } })
  assert.equal(g.city, 'Canggu')
  assert.equal(g.state, 'on')
})

function c(id: string, parent: string | null, deleted = false): PostComment {
  return { id, parent_id: parent, author: deleted ? null : 'u', authorName: deleted ? null : 'U', isTraveller: false, body: deleted ? '' : id, deleted, created_at: '2026-09-16T00:00:00Z' }
}

test('the thread nests one level and keeps deleted placeholders with live replies', () => {
  const flat = [c('a', null, true), c('a1', 'a'), c('b', null), c('b1', 'b'), c('b2', 'b')]
  const t = groupThread(flat)
  assert.deepEqual(t.map((x) => [x.comment.id, x.replies.map((r) => r.id)]), [['a', ['a1']], ['b', ['b1', 'b2']]])
  assert.equal(t[0].comment.deleted, true)
  assert.equal(countLive(flat), 4)
})

test('a reply without its parent is dropped rather than shown unanchored', () => {
  assert.deepEqual(groupThread([c('x1', 'x')]), [])
})
