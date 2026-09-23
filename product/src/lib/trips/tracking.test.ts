import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isQuiet, trackingOf } from './tracking.ts'

test('the stored answer reads as ask, yes, no, or unknown when nothing can be read', () => {
  assert.equal(trackingOf(null), 'ask')
  assert.equal(trackingOf(true), 'yes')
  assert.equal(trackingOf(false), 'no')
  // no profile row, or a database without migration 41: the column is absent
  assert.equal(trackingOf(undefined), 'unknown')
  assert.equal(trackingOf('true'), 'unknown')
})

test('only an unanswered or a "not now" account gets the quiet page', () => {
  assert.equal(isQuiet('ask'), true)
  assert.equal(isQuiet('no'), true)
  assert.equal(isQuiet('yes'), false)
  // an answer that cannot be read never takes the page away
  assert.equal(isQuiet('unknown'), false)
})
