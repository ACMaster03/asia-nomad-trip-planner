import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeFeeds } from './merge.ts'
import type { FollowedEvent } from './follows.ts'
import type { TripEvent } from '../trips/events.ts'

function own(id: string, at: string, extra: Partial<TripEvent> = {}): TripEvent {
  return {
    id,
    trip_id: 'mine',
    author: 'me',
    kind: 'note',
    payload: { text: `own ${id}` },
    visibility: 'trip',
    occurred_at: at,
    created_at: at,
    check_in: null,
    ...extra,
  }
}

function theirs(id: string, at: string, extra: Partial<FollowedEvent> = {}): FollowedEvent {
  return {
    id,
    kind: 'checkin',
    occurred_at: at,
    author: 'bence',
    authorName: 'Bence',
    payload: { placeName: `place ${id}` },
    rating: 4,
    comment: null,
    trip_id: 'japan',
    tripName: 'Japan, at last',
    ...extra,
  }
}

test('one list, newest first, each followed row labelled by who posted it and where', () => {
  const out = mergeFeeds(
    [own('a', '2026-09-16T08:40:00Z'), own('b', '2026-09-15T21:05:00Z')],
    [theirs('x', '2026-09-16T07:10:00Z'), theirs('y', '2026-09-15T17:30:00Z', { authorName: 'Dóri', tripName: 'Lisbon' })],
  )
  assert.deepEqual(
    out.map((i) => [i.source, i.event.id]),
    [
      ['own', 'a'],
      ['followed', 'x'],
      ['own', 'b'],
      ['followed', 'y'],
    ],
  )
  const second = out[1]
  const last = out[3]
  assert.equal(second.source === 'followed' && second.label, 'Bence')
  assert.equal(second.source === 'followed' && second.trip, 'Japan, at last')
  assert.equal(last.source === 'followed' && last.label, 'Dóri')
  assert.equal(last.source === 'followed' && last.trip, 'Lisbon')
})

test('ties keep own rows first and are stable by id across refetches', () => {
  const at = '2026-09-16T07:10:00Z'
  const a = mergeFeeds([own('n2', at), own('n1', at)], [theirs('t2', at), theirs('t1', at)])
  const b = mergeFeeds([own('n1', at), own('n2', at)], [theirs('t1', at), theirs('t2', at)])
  assert.deepEqual(
    a.map((i) => i.event.id),
    ['n1', 'n2', 't1', 't2'],
  )
  assert.deepEqual(
    a.map((i) => i.event.id),
    b.map((i) => i.event.id),
  )
})

test('a limit trims after the merge, not per source; empty inputs are fine', () => {
  const out = mergeFeeds(
    [own('a', '2026-09-16T08:40:00Z')],
    [theirs('x', '2026-09-16T09:00:00Z'), theirs('y', '2026-09-16T08:50:00Z')],
    2,
  )
  assert.deepEqual(
    out.map((i) => i.event.id),
    ['x', 'y'],
  )
  assert.deepEqual(mergeFeeds([], []), [])
  assert.deepEqual(mergeFeeds([], [], 0), [])
})

test('a private own note survives the merge untouched, and never gains a label', () => {
  const [row] = mergeFeeds([own('p', '2026-09-16T08:40:00Z', { visibility: 'trip' })], [])
  assert.equal(row.source, 'own')
  assert.equal(row.event.visibility, 'trip')
  assert.equal('label' in row, false)
})
