import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalogueCity, normCity, sameCity } from './norm.ts'

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

test('catalogueCity: the exact name first, else the same place under another spelling', () => {
  const hk = { city: 'Hong Kong', lat: 22.3, lng: 114.2 }
  const dn = { city: 'Da Nang', lat: 16.1, lng: 108.2 }
  const dnc = { city: 'Da Nang City', lat: 16.0, lng: 108.0 }
  const york = { city: 'York', lat: 54, lng: -1 }
  assert.equal(catalogueCity('Hong Kong Island', [dn, hk]), hk, 'Asia’s stop finds the catalogue’s Hong Kong')
  assert.equal(catalogueCity('Da Nang', [dnc, dn]), dn, 'an exact name beats a longer spelling')
  assert.equal(catalogueCity('New York', [york]), undefined, 'not a word boundary')
  assert.equal(catalogueCity('Hong Kong', [{ city: 'Hong Kong', lat: null, lng: null }]), undefined, 'a city without coordinates cannot be placed')
  assert.equal(catalogueCity('Hong Kong Island', [{ city: 'Hong Kong', lat: null, lng: null }], false)?.city, 'Hong Kong', 'but its costs can be read')
})
