import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isQuiet, quietEntries, trackingOf } from './tracking.ts'
import type { LedgerEntry } from './types.ts'

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

test('the quiet list is what you added, never a booking the Bookings card already counts', () => {
  const e = (id: string, source?: LedgerEntry['source']): LedgerEntry =>
    ({ id, date: '2026-09-20', type: 'expense', category: 'food', amount: 1, currency: 'HUF', note: '', ...(source ? { source } : {}) })
  const ledger = [
    e('typed'),
    e('stay', { kind: 'stay', id: 'st1' }),
    e('fare', { kind: 'transport', id: 't1' }),
    e('visa', { kind: 'extra', id: 'x1' }),
  ]
  assert.deepEqual(quietEntries(ledger).map((r) => r.id), ['typed', 'visa'])
})
