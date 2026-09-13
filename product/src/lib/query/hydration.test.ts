import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query'
import { applyDehydratedState } from './hydration.ts'

const key = ['trip', 't1']

// A server render: fresh per-request client seeded at server time.
function serverState(data: unknown, at: number) {
  const server = new QueryClient()
  server.setQueryData(key, data, { updatedAt: at })
  return dehydrate(server)
}

// A client whose IndexedDB restore already landed with a persisted copy.
function clientWith(data: unknown, at: number) {
  const client = new QueryClient()
  client.setQueryData(key, data, { updatedAt: at })
  return client
}

test('hydrating: the server copy replaces an older persisted copy in the same tick', () => {
  const client = clientWith({ v: 'persisted' }, 1_000)
  applyDehydratedState(client, serverState({ v: 'server' }, 2_000), { hydrating: true, now: 5_000 })
  assert.deepEqual(client.getQueryData(key), { v: 'server' })
  assert.equal(client.getQueryState(key)?.dataUpdatedAt, 5_000)
})

test('hydrating: the server copy wins even when the persisted timestamp is later (clock skew)', () => {
  const client = clientWith({ v: 'persisted' }, 9_000)
  applyDehydratedState(client, serverState({ v: 'server' }, 2_000), { hydrating: true, now: 5_000 })
  assert.deepEqual(client.getQueryData(key), { v: 'server' })
})

test('hydrating: a persisted restore that lands afterwards cannot overwrite the server copy', () => {
  const client = new QueryClient()
  applyDehydratedState(client, serverState({ v: 'server' }, 2_000), { hydrating: true, now: 5_000 })
  // query-core's hydrate() is what the persister calls; it compares dataUpdatedAt.
  const persisted = new QueryClient()
  persisted.setQueryData(key, { v: 'persisted' }, { updatedAt: 4_999 })
  hydrate(client, dehydrate(persisted))
  assert.deepEqual(client.getQueryData(key), { v: 'server' })
})

test('hydrating: a query the cache does not hold yet is added', () => {
  const client = new QueryClient()
  applyDehydratedState(client, serverState({ v: 'server' }, 2_000), { hydrating: true, now: 5_000 })
  assert.deepEqual(client.getQueryData(key), { v: 'server' })
  assert.equal(client.getQueryState(key)?.dataUpdatedAt, 5_000)
})

test('hydrating: an in-flight refetch keeps its fetchStatus', () => {
  const client = clientWith({ v: 'persisted' }, 1_000)
  client.getQueryCache().find({ queryKey: key })!.setState({ fetchStatus: 'fetching' })
  applyDehydratedState(client, serverState({ v: 'server' }, 2_000), { hydrating: true, now: 5_000 })
  assert.equal(client.getQueryState(key)?.fetchStatus, 'fetching')
  assert.deepEqual(client.getQueryData(key), { v: 'server' })
})

test('navigating: a newer server copy is applied synchronously', () => {
  const client = clientWith({ v: 'cached' }, 1_000)
  applyDehydratedState(client, serverState({ v: 'server' }, 2_000), { hydrating: false })
  assert.deepEqual(client.getQueryData(key), { v: 'server' })
  assert.equal(client.getQueryState(key)?.dataUpdatedAt, 2_000)
})

test('navigating: an older server copy leaves the cache alone', () => {
  const client = clientWith({ v: 'cached' }, 3_000)
  applyDehydratedState(client, serverState({ v: 'server' }, 2_000), { hydrating: false })
  assert.deepEqual(client.getQueryData(key), { v: 'cached' })
})

test('the post-hydration re-render is a no-op', () => {
  const client = clientWith({ v: 'persisted' }, 1_000)
  const state = serverState({ v: 'server' }, 2_000)
  applyDehydratedState(client, state, { hydrating: true, now: 5_000 })
  let updates = 0
  const unsub = client.getQueryCache().subscribe((e) => { if (e.type === 'updated') updates++ })
  applyDehydratedState(client, state, { hydrating: false })
  unsub()
  assert.equal(updates, 0)
  assert.deepEqual(client.getQueryData(key), { v: 'server' })
})
