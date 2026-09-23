import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraCategoryId, oneOffs } from './extras.ts'
import type { LedgerEntry, TripState } from './types.ts'

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

// ---- the One-offs card ------------------------------------------------------

const trip = (extras: unknown[]) => ({
  meta: { version: 1, tripName: 'T', travelers: 2, baseCurrency: 'HUF', budgetCap: 0, startDate: '2026-08-31' },
  rates: { HUF: 1, USD: 340 },
  segments: [], stays: [], transport: [], extras, notes: {},
}) as unknown as TripState
const row = (id: string, date: string, category: string, amount: number, over: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id, date, type: 'expense', category, amount, currency: 'HUF', note: '', ...over })
const TODAY = '2026-09-23'

test('two extras in one category are two lines under one heading (the e-visas were counted, not listed)', () => {
  // Petra's card on 23 Sep: Insurance & visas 290 304 | 290 304, Fees & cash — | 4766
  const state = trip([
    { id: 'ins', label: 'Insurance', category: 'Insurance', cur: 'HUF', amount: 274_000, include: true, paidOn: '2026-08-12' },
    { id: 'vis', label: '2 E-visas (Vietnam)', category: 'Visa', cur: 'HUF', amount: 16_304, include: true, paidOn: '2026-08-20' },
  ])
  const ledger = [
    row('le-plan-extra-ins', '2026-08-12', 'insurance', 274_000, { note: 'Insurance', source: { kind: 'extra', id: 'ins' } }),
    row('le-plan-extra-vis', '2026-08-20', 'insurance', 16_304, { note: '2 E-visas (Vietnam)', source: { kind: 'extra', id: 'vis' } }),
    row('f1', '2026-09-04', 'fees', 4_766, { note: 'Bank transaction fee' }),
  ]
  const v = oneOffs(state, ledger, TODAY)
  assert.deepEqual(v.groups.map((g) => g.cat), ['insurance', 'fees'])
  const [ins, fees] = v.groups
  assert.equal(ins.planned, 290_304)
  assert.equal(ins.paid, 290_304)
  assert.deepEqual(ins.items.map((i) => [i.label, i.state, i.date]), [
    ['Insurance', 'paid', '2026-08-12'],
    ['2 E-visas (Vietnam)', 'paid', '2026-08-20'],
  ])
  assert.equal(ins.logged, undefined, 'an extra’s own row is its line, never a logged payment as well')
  assert.equal(fees.planned, 0)
  assert.equal(fees.paid, 4_766)
  assert.deepEqual(fees.logged, { note: 'Bank transaction fee', date: '2026-09-04', more: 0 })
  assert.equal(v.plannedTotal, 290_304)
  assert.equal(v.paidTotal, 295_070)
})

test('each extra says where it stands: not paid, a date still ahead, or paid while switched off', () => {
  const state = trip([
    { id: 'gear', label: 'Backpacks', category: 'Gear', cur: 'HUF', amount: 205_000, include: true },
    { id: 'vac', label: 'Rabies jabs', category: 'Vaccines', cur: 'HUF', amount: 60_000, include: true, paidOn: '2026-10-02' },
    { id: 'phone', label: 'Anna’s phone', category: 'Gear', cur: 'HUF', amount: 250_000, include: false },
    { id: 'sim', label: 'eSIM', category: 'SIM/eSIM', cur: 'USD', amount: 10, include: false, paidOn: '2026-09-01' },
  ])
  const ledger = [
    // three gear payments typed on Money: the latest names the line
    row('g1', '2026-08-20', 'gear', 64_900, { note: 'Osprey backpack' }),
    row('g2', '2026-08-25', 'gear', 9_000, { note: 'Adapter' }),
    row('g3', '2026-08-22', 'gear', 12_000, { note: 'Router' }),
    // the vaccine's row is dated after today: scheduled, not paid
    row('le-plan-extra-vac', '2026-10-02', 'health', 60_000, { source: { kind: 'extra', id: 'vac' } }),
    // switched off on the list, but paid
    row('le-plan-extra-sim', '2026-09-01', 'connectivity', 10, { currency: 'USD', source: { kind: 'extra', id: 'sim' } }),
    // a massage is health too, but everyday: never a one-off
    row('h1', '2026-09-10', 'health', 3_000, { note: 'Massage' }),
  ]
  const v = oneOffs(state, ledger, TODAY)
  const by = Object.fromEntries(v.groups.map((g) => [g.cat, g]))

  assert.equal(by.gear.planned, 205_000, 'the unticked phone is not planned')
  assert.equal(by.gear.paid, 85_900)
  assert.deepEqual(by.gear.items.map((i) => [i.label, i.state]), [['Backpacks', 'unpaid']])
  assert.deepEqual(by.gear.logged, { note: 'Adapter', date: '2026-08-25', more: 2 })

  assert.equal(by.health.planned, 60_000)
  assert.equal(by.health.paid, 0)
  assert.deepEqual(by.health.items.map((i) => [i.state, i.date]), [['scheduled', '2026-10-02']])
  assert.equal(by.health.logged, undefined)

  assert.equal(by.connectivity.planned, 0)
  assert.equal(by.connectivity.paid, 3_400)
  assert.deepEqual(by.connectivity.items.map((i) => [i.state, i.off]), [['paid', true]])

  // only the phone is in no total: unticked and unpaid
  assert.equal(v.excludedCount, 1)
  assert.equal(v.excluded, 250_000)
})

test('a payment left behind by a deleted extra stays paid and shows as a logged line', () => {
  const ledger = [row('le-plan-extra-old', '2026-08-12', 'insurance', 274_000, {
    note: 'Insurance', orphaned: true, source: { kind: 'extra', id: 'old' },
  })]
  const [g] = oneOffs(trip([]), ledger, TODAY).groups
  assert.equal(g.paid, 274_000)
  assert.deepEqual(g.items, [])
  assert.deepEqual(g.logged, { note: 'Insurance', date: '2026-08-12', more: 0 })
})
