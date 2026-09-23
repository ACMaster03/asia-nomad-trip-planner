import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasLoggedSpending, isQuiet, trackingOf } from './tracking.ts'
import type { LedgerEntry } from './types.ts'

test('the stored answer reads as ask, yes, no, or unknown when nothing can be read', () => {
  assert.equal(trackingOf(null), 'ask')
  assert.equal(trackingOf(true), 'yes')
  assert.equal(trackingOf(false), 'no')
  // no profile row, or a database without migration 41: the column is absent
  assert.equal(trackingOf(undefined), 'unknown')
  assert.equal(trackingOf('true'), 'unknown')
})

test('the quiet page is for "not now", and for an unanswered account that has logged nothing', () => {
  for (const logged of [false, true]) {
    assert.equal(isQuiet('no', logged), true)
    assert.equal(isQuiet('yes', logged), false)
    // an answer that cannot be read never takes the page away
    assert.equal(isQuiet('unknown', logged), false)
  }
  // behind the question: a newcomer sees the quiet page, a tracker their own page
  assert.equal(isQuiet('ask', false), true)
  assert.equal(isQuiet('ask', true), false)
})

test('only costs typed on Money count as logged spending, not the rows the plan wrote', () => {
  const e = (id: string, source?: LedgerEntry['source']): LedgerEntry =>
    ({ id, date: '2026-09-20', type: 'expense', category: 'food', amount: 1, currency: 'HUF', note: '', ...(source ? { source } : {}) })
  assert.equal(hasLoggedSpending([]), false)
  assert.equal(hasLoggedSpending([e('stay', { kind: 'stay', id: 'st1' }), e('visa', { kind: 'extra', id: 'x1' })]), false)
  assert.equal(hasLoggedSpending([e('stay', { kind: 'stay', id: 'st1' }), e('coffee')]), true)
})
