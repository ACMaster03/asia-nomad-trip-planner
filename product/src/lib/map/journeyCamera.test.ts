import { test } from 'node:test'
import assert from 'node:assert/strict'
import { angDeg, centroid, geodesic, journeyCamera, legDuration, peekText, spreadDeg, worldCamera, DEFAULT_CAMERA, MAX_ALTITUDE } from './journeyCamera.ts'

const BUD = { lat: 47.4979, lng: 19.0402 }
const BKK = { lat: 13.7563, lng: 100.5018 }
const HAN = { lat: 21.0278, lng: 105.8342 }
const DAD = { lat: 16.0544, lng: 108.2022 }
const TYO = { lat: 35.68, lng: 139.69 }
const HNL = { lat: 21.31, lng: -157.86 }

test('angDeg: Budapest to Bangkok is about 76 degrees, a place to itself is 0', () => {
  assert.ok(Math.abs(angDeg(BUD, BKK) - 74) < 1)
  assert.equal(angDeg(HAN, HAN), 0)
})

test('centroid goes through the sphere: Tokyo and Honolulu meet over the Pacific, not Africa', () => {
  const c = centroid([TYO, HNL])!
  assert.ok(c.lng > 150 || c.lng < -150, `lng ${c.lng}`)
  assert.equal(centroid([]), null)
  const one = centroid([HAN])!
  assert.ok(Math.abs(one.lat - HAN.lat) < 1e-6 && Math.abs(one.lng - HAN.lng) < 1e-6)
})

test('journeyCamera: a wide journey sits high, a tight one low, nothing sits over Asia', () => {
  const wide = journeyCamera([BUD, BKK, HAN, DAD])
  const tight = journeyCamera([HAN, DAD])
  assert.ok(wide.altitude > tight.altitude)
  assert.ok(tight.altitude >= 0.75 && wide.altitude <= MAX_ALTITUDE)
  assert.ok(wide.lng > 19 && wide.lng < 108)
  assert.deepEqual(journeyCamera([]), DEFAULT_CAMERA)
  assert.equal(worldCamera([HAN]).altitude, MAX_ALTITUDE)
  assert.equal(spreadDeg([HAN]), 0)
})

test('legDuration: longer legs fly longer, between 0.9 and 2.4 seconds', () => {
  assert.ok(legDuration(HAN, DAD) < legDuration(BUD, BKK))
  assert.equal(legDuration(HAN, HAN), 900)
  assert.equal(legDuration(BUD, HNL), 2400)
})

test('peekText: the stop you are in and the next one; before the journey the first stop', () => {
  const segs = [
    { city: 'Bangkok', arrive: '2026-09-01', depart: '2026-09-30' },
    { city: 'Hanoi', arrive: '2026-09-30', depart: '2026-11-13' },
    { city: 'Da Nang', arrive: '2026-11-13', depart: '2026-12-13' },
    { city: 'Hoi An', arrive: '2026-12-13', depart: '2026-12-20', include: false },
  ]
  const nights = (s: { arrive: string; depart: string }) => Math.round((Date.parse(s.depart) - Date.parse(s.arrive)) / 86_400_000)
  const short = (iso: string) => iso.slice(8, 10) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(iso.slice(5, 7)) - 1]
  assert.deepEqual(peekText({ tripName: 'Asia' }, segs, '2026-10-14', short, nights), { title: 'Hanoi', line: 'Night 15 of 44 · Da Nang next, 13 Nov' })
  assert.deepEqual(peekText({ tripName: 'Asia' }, segs, '2026-08-20', short, nights), { title: 'Bangkok', line: 'Bangkok next, 01 Sep' })
  assert.deepEqual(peekText({ tripName: 'Asia' }, segs, '2027-01-01', short, nights), { title: 'Asia', line: '' })
})

test('geodesic: starts and ends at the places, one point every two degrees, on the great circle', () => {
  const pts = geodesic(BUD, BKK)
  assert.equal(pts.length, Math.ceil(angDeg(BUD, BKK) / 2) + 1)
  assert.ok(Math.abs(pts[0][0] - BUD.lng) < 1e-6 && Math.abs(pts[0][1] - BUD.lat) < 1e-6)
  const last = pts[pts.length - 1]
  assert.ok(Math.abs(last[0] - BKK.lng) < 1e-6 && Math.abs(last[1] - BKK.lat) < 1e-6)
  // the middle of Budapest → Bangkok passes north of a straight line in lat/lng, through Iran's latitudes
  const mid = pts[Math.floor(pts.length / 2)]
  assert.ok(mid[1] > 30 && mid[1] < 40, `mid lat ${mid[1]}`)
  assert.equal(geodesic(HAN, HAN).length, 2)
})
