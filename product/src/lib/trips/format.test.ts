import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtMoneyShort, parseAmount } from './format.ts'

// Patrik, 26 Sep: on a Hungarian iPhone the decimal key types a comma, and the
// amount fields threw "12,5" away.
test('an amount reads a comma or a dot as the decimal separator', () => {
  assert.equal(parseAmount('12,5'), 12.5)
  assert.equal(parseAmount('12.5'), 12.5)
  assert.equal(parseAmount('10,99'), 10.99)
  assert.equal(parseAmount('0,5'), 0.5)
  assert.equal(parseAmount(',5'), 0.5)
  assert.equal(parseAmount('12,'), 12, 'mid-typing')
  assert.equal(parseAmount('3290'), 3290)
})

test('spaces are ignored, anything else is refused', () => {
  assert.equal(parseAmount(' 1 000 '), 1000)
  assert.equal(parseAmount('1\u00a0000,50'), 1000.5)
  for (const bad of ['', ' ', ',', 'abc', '12,5,3', '1.234,5', '-5', '12€']) assert.ok(Number.isNaN(parseAmount(bad)), bad)
})

test('a large amount reads in millions, the phone\'s way; a small one in full', () => {
  assert.equal(fmtMoneyShort(1_876_055, 'HUF'), '1.88 M Ft')
  assert.equal(fmtMoneyShort(3_000_000, 'HUF'), '3 M Ft')
  assert.equal(fmtMoneyShort(2_500_000, 'USD'), '$2.5 M')
  assert.equal(fmtMoneyShort(-3_043_945, 'HUF'), '-3.04 M Ft')
  assert.equal(fmtMoneyShort(999_999, 'HUF'), '999\u00a0999\u00a0Ft')
})
