import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasSessionCookie } from './sessionCookie.ts'

test('a session cookie, whole or in chunks, counts', () => {
  assert.equal(hasSessionCookie(['sb-wvmnudcwcqktcugouqoe-auth-token']), true)
  assert.equal(hasSessionCookie(['theme', 'sb-wvmnudcwcqktcugouqoe-auth-token.0', 'sb-wvmnudcwcqktcugouqoe-auth-token.1']), true)
})

test('no session cookie, or only a sign-in in progress, does not', () => {
  assert.equal(hasSessionCookie([]), false)
  assert.equal(hasSessionCookie(['theme', 'lv-opened']), false)
  assert.equal(hasSessionCookie(['sb-wvmnudcwcqktcugouqoe-auth-token-code-verifier']), false)
})
