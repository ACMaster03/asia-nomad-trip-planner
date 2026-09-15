import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planImports } from './importCosts.ts'
import type { TripState } from './types.ts'

const base = {
  meta: { version: 1, tripName: 'T', travelers: 1, baseCurrency: 'HUF', budgetCap: 0, startDate: '2026-09-01' },
  rates: { HUF: 1, USD: 340 },
  segments: [{ id: 'lis', country: 'Portugal', city: 'Lisbon', arrive: '2026-10-01', depart: '2026-10-11' }],
  stays: [],
  transport: [],
  extras: [],
  notes: {},
} as unknown as TripState

const stay = (status: string, chargeDate = '2026-09-20') => ({
  id: 'st', segId: 'lis', name: 'Alfama flat', cur: 'USD', ppn: 50, nights: 10, include: true, status, chargeDate,
})

test('a drafted stay never reaches the ledger, whatever its charge date', () => {
  for (const status of ['idea', 'shortlist', '']) {
    const state = { ...base, stays: [stay(status)] } as TripState
    assert.deepEqual(planImports(state, []).candidates, [], `status "${status}" must not import`)
  }
  // ...and the same stay, once chosen, does
  const chosen = { ...base, stays: [stay('chosen')] } as TripState
  const [row] = planImports(chosen, []).candidates
  assert.equal(row.amount, 500)
  assert.equal(row.date, '2026-09-20')
  assert.equal(row.category, 'stays')
})

test('a fare imports on its charge date when there is one, else on the travel date', () => {
  const leg = { id: 't1', type: 'Flight', from: 'BUD', to: 'LIS', cur: 'USD', price: 300, include: true, status: 'booked' }
  const travelOnly = { ...base, transport: [{ ...leg, date: '2026-12-24' }] } as unknown as TripState
  assert.equal(planImports(travelOnly, []).candidates[0].date, '2026-12-24')

  // paid at booking, months before the flight — the money moved in September
  const paidEarly = { ...base, transport: [{ ...leg, date: '2026-12-24', chargeDate: '2026-09-02' }] } as unknown as TripState
  assert.equal(planImports(paidEarly, []).candidates[0].date, '2026-09-02')

  // a charge date alone is enough; a leg with neither date has nothing to book
  const noTravelDate = { ...base, transport: [{ ...leg, chargeDate: '2026-09-02' }] } as unknown as TripState
  assert.equal(planImports(noTravelDate, []).candidates[0].date, '2026-09-02')
  const undated = { ...base, transport: [leg] } as unknown as TripState
  assert.deepEqual(planImports(undated, []).candidates, [])
})
