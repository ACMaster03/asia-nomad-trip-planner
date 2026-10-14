import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ownerOf, spentByPlace, upcomingCharges } from './moneyRows.ts'
import { bookingsSummary } from './spending.ts'
import type { LedgerEntry, TripState } from './types'

const rates = { HUF: 1, USD: 340 }
const state = (over: Partial<TripState> = {}): TripState => ({
  meta: { version: 1, tripName: 'Asia', travelers: 2, baseCurrency: 'HUF', budgetCap: 0, startDate: '2026-08-31', endDate: '2027-04-30', homeBase: 'Budapest' },
  rates,
  segments: [
    { id: 'bkk', country: 'Thailand', city: 'Bangkok', arrive: '2026-09-01', depart: '2026-09-30' },
    { id: 'han', country: 'Vietnam', city: 'Hanoi', arrive: '2026-09-30', depart: '2026-11-13' },
    { id: 'dad', country: 'Vietnam', city: 'Da Nang', arrive: '2026-11-13', depart: '2026-12-13' },
  ],
  stays: [
    { id: 'st2', segId: 'han', name: 'Văn Giang', cur: 'USD', ppn: 29, status: 'booked', include: true, chargeDate: '2026-09-29' },
    { id: 'st3', segId: 'dad', name: 'An Bang beach house', cur: 'USD', ppn: 41, status: 'booked', include: true, checkIn: '2026-11-13', checkOut: '2026-11-30', chargeAtCheckIn: true, chargeDate: '2026-11-13' },
    { id: 'st4', segId: 'dad', name: 'Hoi An loft', cur: 'USD', ppn: 38, status: 'idea', include: true },
  ],
  transport: [
    { id: 't1', type: 'flight', from: 'Budapest', to: 'Bangkok', date: '2026-08-31', cur: 'HUF', price: 248_000, status: 'booked', include: true, chargeDate: '2026-07-09' },
    { id: 't3', type: 'flight', from: 'Da Nang', to: 'Hong Kong', date: '2026-12-13', cur: 'USD', price: 258, status: 'booked', include: true, chargeDate: '2026-11-20' },
  ],
  notes: {},
  ...over,
})
const e = (id: string, date: string, category: string, amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id, date, type: 'expense', category, amount, currency: 'HUF', note: '', ...extra })
const ledger: LedgerEntry[] = [
  e('ins', '2026-08-12', 'insurance', 340_000),
  e('imp-t1', '2026-07-09', 'transport', 248_000, { source: { kind: 'transport', id: 't1' } }),
  e('f1', '2026-09-02', 'food', 3_000),
  e('f2', '2026-10-01', 'food', 2_000),
  e('f3', '2026-10-14', 'food', 1_000),
  e('imp-st2', '2026-09-29', 'stays', 433_840, { source: { kind: 'stay', id: 'st2' } }),
  e('gear', '2026-11-20', 'gear', 20_000, { note: 'Rain jacket' }),
  e('sub', '2026-11-14', 'subscriptions', 3_290, { source: { kind: 'sub', id: 'x@2026-11-14' } }),
]

test('upcomingCharges: entries dated ahead and bookings with no entry, soonest first, subscriptions left out (#149)', () => {
  const st = state()
  const up = upcomingCharges(st, ledger, bookingsSummary(st, ledger, '2026-10-14'), rates, '2026-10-14')
  assert.deepEqual(up.map((u) => [u.id, u.date, u.city ?? null, u.atCheckIn]), [
    ['stay:st3', '2026-11-13', 'Da Nang', true],
    // the same day: the larger charge first
    ['transport:t3', '2026-11-20', null, false],
    ['gear', '2026-11-20', null, false],
  ])
  assert.equal(up[0].amount, 17 * 41 * 340)
  assert.equal(up[0].opens.kind, 'stay')
  assert.equal(up[1].title, 'Da Nang → Hong Kong')
  assert.equal(up[2].title, 'Rain jacket')
  // the same list on 21 Nov: the gear and the flight have passed, the stay charged at check-in too
  assert.deepEqual(upcomingCharges(st, ledger, bookingsSummary(st, ledger, '2026-11-21'), rates, '2026-11-21').map((u) => u.id), [])
})

test('ownerOf: a travel day belongs to the stop you move to; none between stops', () => {
  const st = state()
  assert.equal(ownerOf(st, '2026-09-30')?.id, 'han')
  assert.equal(ownerOf(st, '2026-09-15')?.id, 'bkk')
  assert.equal(ownerOf(st, '2026-12-20'), undefined)
})

test('spentByPlace: before departure, each stop by date, between stops; the parts add up to spent', () => {
  const st = state()
  const parts = spentByPlace(st, ledger, rates, '2026-10-14', st.segments[1])
  assert.deepEqual(parts.map((p) => [p.id, p.kind, p.total, p.isCurrent]), [
    ['before', 'before', 588_000, false],
    ['bkk', 'stop', 3_000 + 433_840, false],
    ['han', 'stop', 3_000, true],
  ])
  assert.equal(parts[0].to, '2026-08-30')
  assert.equal(parts[1].from, '2026-09-01'); assert.equal(parts[1].to, '2026-09-29')
  assert.equal(parts[2].to, '2026-10-14')
  const spent = ledger.filter((x) => x.date <= '2026-10-14').reduce((a, x) => a + x.amount, 0)
  assert.equal(parts.reduce((a, p) => a + p.total, 0), spent)
})
