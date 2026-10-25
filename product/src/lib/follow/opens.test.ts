import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldMark, utcDay } from './opens.ts'

test('utcDay is the UTC date, whatever the local clock says', () => {
  // 23:30 in Hanoi on 25 Oct is 16:30 UTC the same day; 06:30 in Hanoi on 26 Oct is still 25 Oct UTC
  assert.equal(utcDay(new Date('2026-10-25T16:30:00Z')), '2026-10-25')
  assert.equal(utcDay(new Date('2026-10-25T23:30:00Z')), '2026-10-25')
  assert.equal(utcDay(new Date('2026-10-26T00:00:00Z')), '2026-10-26')
})

test('one mark a day per feed', () => {
  assert.equal(shouldMark(null, '2026-10-25'), true)
  assert.equal(shouldMark('2026-10-24', '2026-10-25'), true)
  assert.equal(shouldMark('2026-10-25', '2026-10-25'), false)
})
