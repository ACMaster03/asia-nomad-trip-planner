import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickEntryCurrency } from './entryCurrency.ts'

const watched = ['HUF', 'THB', 'VND', 'USD']

test('the country you are in wins over the last currency you typed', () => {
  assert.equal(
    pickEntryCurrency({ hereCodes: ['THB'], watched, lastUsed: 'HUF', base: 'HUF' }),
    'THB',
  )
})

test('between stops, or before departure, it falls back to the last one used', () => {
  assert.equal(
    pickEntryCurrency({ hereCodes: [], watched, lastUsed: 'VND', base: 'HUF' }),
    'VND',
  )
})

test('with no history at all it is the trip base', () => {
  assert.equal(pickEntryCurrency({ hereCodes: [], watched, lastUsed: null, base: 'HUF' }), 'HUF')
})

test('a currency the trip does not watch is never offered, from either source', () => {
  // KHR removed from the watchlist by hand: Cambodia's other currency is taken.
  assert.equal(
    pickEntryCurrency({ hereCodes: ['KHR', 'USD'], watched, lastUsed: 'HUF', base: 'HUF' }),
    'USD',
  )
  // Neither the country nor the history is watched, so base is all that is left.
  assert.equal(
    pickEntryCurrency({ hereCodes: ['LAK'], watched, lastUsed: 'KHR', base: 'HUF' }),
    'HUF',
  )
})

test('multi-currency countries follow catalogue order, so the domestic one leads', () => {
  assert.equal(
    pickEntryCurrency({ hereCodes: ['KHR', 'USD'], watched: ['KHR', 'USD', 'HUF'], lastUsed: 'HUF', base: 'HUF' }),
    'KHR',
  )
})
