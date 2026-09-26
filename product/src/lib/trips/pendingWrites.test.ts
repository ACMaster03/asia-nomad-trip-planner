import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withPendingWrites } from './pendingWrites.ts'
import type { Trip } from './types.ts'

const trip = (tags: string, rows: string, rev: number, id = 't'): Trip =>
  ({ id, name: 'T', state: { tags } as never, state_rev: rev, ledger: [{ id: rows }] as never, ledger_rev: rev } as unknown as Trip)

test('nothing pending: the refetched document lands as it is', () => {
  const fresh = trip('a', 'r1', 2)
  assert.equal(withPendingWrites(fresh, trip('a,b', 'r1,r2', 3), { state: false, ledger: false }), fresh)
})

test('state writes pending: the cached state and its revision stay, the ledger comes from the server', () => {
  const out = withPendingWrites(trip('a', 'r1', 2), trip('a,b', 'r0', 3), { state: true, ledger: false })!
  assert.deepEqual([out.state, out.state_rev, out.ledger, out.ledger_rev], [{ tags: 'a,b' }, 3, [{ id: 'r1' }], 2])
})

test('ledger writes pending: the cached ledger and its revision stay, the state comes from the server', () => {
  const out = withPendingWrites(trip('a', 'r1', 2), trip('x', 'r1,r2', 3), { state: false, ledger: true })!
  assert.deepEqual([out.state, out.state_rev, out.ledger, out.ledger_rev], [{ tags: 'a' }, 2, [{ id: 'r1,r2' }], 3])
})

test('another trip in the cache, or none: the refetched document lands as it is', () => {
  const fresh = trip('a', 'r1', 2)
  assert.equal(withPendingWrites(fresh, trip('b', 'r2', 3, 'other'), { state: true, ledger: true }), fresh)
  assert.equal(withPendingWrites(fresh, undefined, { state: true, ledger: true }), fresh)
  assert.equal(withPendingWrites(null, trip('b', 'r2', 3), { state: true, ledger: true }), null)
})
