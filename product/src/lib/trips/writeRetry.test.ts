import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldRetryWrite, isExpiredToken, withFreshSession, writeRetryDelay } from './writeRetry.ts'
import { RevConflictError, PermissionDeniedError } from './errors.ts'

test('transient failures retry twice; conflicts and permission failures never do', () => {
  const net = new TypeError('Load failed')
  assert.equal(shouldRetryWrite(0, net), true)
  assert.equal(shouldRetryWrite(1, net), true)
  assert.equal(shouldRetryWrite(2, net), false)
  assert.equal(shouldRetryWrite(0, new RevConflictError()), false)
  assert.equal(shouldRetryWrite(0, new PermissionDeniedError()), false)
  assert.ok(writeRetryDelay(0) < writeRetryDelay(1))
  assert.equal(writeRetryDelay(9), 3000)
})

test('an expired token is refreshed once and the write re-run', async () => {
  let refreshed = 0
  let calls = 0
  const sb = { auth: { refreshSession: async () => { refreshed++; return {} } } }
  const out = await withFreshSession(sb as never, async () => {
    calls++
    if (calls === 1) throw { code: 'PGRST301', message: 'JWT expired' }
    return 'ok'
  })
  assert.equal(out, 'ok')
  assert.equal(refreshed, 1)
  assert.equal(calls, 2)
  assert.equal(isExpiredToken({ status: 401 }), true)
  assert.equal(isExpiredToken(new Error('boom')), false)
  await assert.rejects(withFreshSession(sb as never, async () => { throw new Error('boom') }), /boom/)
  assert.equal(refreshed, 1)
})
