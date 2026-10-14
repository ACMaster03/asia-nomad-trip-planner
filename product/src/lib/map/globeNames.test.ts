import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countryLabels, labelBudget, normCountry, pickCountryLabels, ringSize, stopNamesShown, type GeoFeature } from './globeNames.ts'

const square = (name: string, lng: number, lat: number, side: number): GeoFeature => ({
  properties: { name },
  geometry: { type: 'Polygon', coordinates: [[[lng, lat], [lng + side, lat], [lng + side, lat + side], [lng, lat + side], [lng, lat]]] },
})

test('ringSize: the area shrinks towards the poles, the middle is the box\'s middle', () => {
  const eq = ringSize(square('a', 0, 0, 10).geometry.coordinates[0] as number[][])
  const north = ringSize(square('b', 0, 60, 10).geometry.coordinates[0] as number[][])
  assert.ok(eq.area > north.area)
  assert.deepEqual([eq.lat, eq.lng], [5, 5])
})

test('countryLabels: biggest first, placed on the biggest piece, Antarctica and nameless shapes left out', () => {
  const multi: GeoFeature = {
    properties: { name: 'Twin' },
    geometry: { type: 'MultiPolygon', coordinates: [square('x', 100, 0, 2).geometry.coordinates as number[][][], square('y', 120, 0, 8).geometry.coordinates as number[][][]] },
  }
  const labels = countryLabels([square('Small', 0, 0, 3), square('Big', 20, 0, 12), multi, square('Antarctica', 0, -85, 30), { geometry: square('', 0, 0, 1).geometry }])
  assert.deepEqual(labels.map((l) => l.name), ['Big', 'Twin', 'Small'])
  const twin = labels.find((l) => l.name === 'Twin')!
  assert.deepEqual([twin.lat, twin.lng], [4, 124])
})

test('pickCountryLabels: your countries first, the rest by size within the budget, none far out', () => {
  const labels = countryLabels([square('A', 0, 0, 30), square('B', 40, 0, 20), square('Vietnam', 100, 10, 5), square('D', 120, 0, 15)])
  const mine = new Set(['vietnam'])
  assert.deepEqual(pickCountryLabels(labels, 1.0, mine).map((l) => l.name), ['Vietnam', 'A', 'B', 'D'])
  assert.equal(labelBudget(3.0), 8)
  assert.deepEqual(pickCountryLabels(labels, 3.5, mine), [])
  assert.equal(normCountry('Viet Nam'), 'vietnam')
  assert.equal(stopNamesShown(3), false)
  assert.equal(stopNamesShown(1.2), true)
})
