import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rateText, refreshedText } from './fxText.ts'

const NOW = new Date(2026, 9, 14, 9, 30) // 14 Oct 2026, 09:30 local

test('when the rates were refreshed', () => {
  assert.equal(refreshedText(null, NOW), 'Saved with the journey')
  assert.equal(refreshedText('not a date', NOW), 'Saved with the journey')
  assert.equal(refreshedText(new Date(2026, 9, 14, 4, 0).toISOString(), NOW), 'Refreshed today, 04:00')
  assert.equal(refreshedText(new Date(2026, 9, 13, 4, 5).toISOString(), NOW), 'Refreshed yesterday, 04:05')
  assert.equal(refreshedText(new Date(2026, 9, 2, 4, 0).toISOString(), NOW), 'Refreshed 2 Oct')
})

test('one unit in the base currency', () => {
  const ft = (n: number) => `${Math.round(n).toLocaleString('en-US').replace(/,/g, ' ')} Ft`
  assert.equal(rateText(10.2, ft), '10 Ft')
  assert.equal(rateText(340, ft), '340 Ft')
  assert.equal(rateText(0.0318, ft), '0.0318 Ft')
  assert.equal(rateText(0, ft), '—')
  const usd = (n: number) => `$${n.toFixed(2)}`
  assert.equal(rateText(0.0029, usd), '$0.0029')
  assert.equal(rateText(1.1, usd), '$1.10')
})
