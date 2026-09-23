import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraCategoryId } from './extras.ts'

test('the extras form words land on registry ids, both sides of the One-offs card agree', () => {
  // the form's own seven words
  assert.equal(extraCategoryId('Visa'), 'insurance')
  assert.equal(extraCategoryId('Insurance'), 'insurance')
  assert.equal(extraCategoryId('Vaccines'), 'health')
  assert.equal(extraCategoryId('Gear'), 'gear')
  assert.equal(extraCategoryId('Flights (intl)'), 'transport')
  assert.equal(extraCategoryId('SIM/eSIM'), 'connectivity')
  assert.equal(extraCategoryId('Other'), 'other')
  // registry ids (the preview fixture, rows written by a newer form) pass through
  assert.equal(extraCategoryId('insurance'), 'insurance')
  assert.equal(extraCategoryId('fees'), 'fees')
  // anything else is "other", never a row of its own
  assert.equal(extraCategoryId('Something odd'), 'other')
  assert.equal(extraCategoryId(''), 'other')
  assert.equal(extraCategoryId(undefined), 'other')
})
