import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normCity, sameCity } from './norm.ts'

test('normCity drops a parenthesised suffix, trims and lowercases', () => {
  assert.equal(normCity('Bangkok (Sukhumvit)'), 'bangkok')
  assert.equal(normCity('  Hanoi '), 'hanoi')
  assert.equal(normCity(undefined), '')
})

test('sameCity: equal after normalising, or one name is the other plus more words', () => {
  assert.equal(sameCity('Hong Kong', 'Hong Kong Island'), true)
  assert.equal(sameCity('hong kong island', 'Hong Kong'), true)
  assert.equal(sameCity('Bangkok (Sukhumvit)', 'Bangkok'), true)
  assert.equal(sameCity('Da Nang City', 'Da Nang'), true)
  assert.equal(sameCity('York', 'New York'), false)
  assert.equal(sameCity('Hanoi', 'Hanoi'), true)
  assert.equal(sameCity('', 'Hanoi'), false)
})
