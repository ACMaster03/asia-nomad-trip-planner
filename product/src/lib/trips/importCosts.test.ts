import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planImports, subChargesDue } from './importCosts.ts'
import type { LedgerEntry, Subscription, TripState } from './types.ts'

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

// ---- extras: a paid-on date is the payment (2026-09-23) ----------------------

const extra = (over: Record<string, unknown> = {}) => ({
  id: 'x1', label: 'Insurance', category: 'Insurance', cur: 'HUF', amount: 274_000, include: true, ...over,
})

test('an extra imports the day it is paid, under the ledger id its word maps to', () => {
  const planned = { ...base, extras: [extra()] } as unknown as TripState
  assert.deepEqual(planImports(planned, []).candidates, [], 'no date, no payment')

  const paid = { ...base, extras: [extra({ paidOn: '2026-08-12' })] } as unknown as TripState
  const [row] = planImports(paid, []).candidates
  assert.equal(row.id, 'le-plan-extra-x1')
  assert.equal(row.date, '2026-08-12')
  assert.equal(row.category, 'insurance')
  assert.equal(row.amount, 274_000)
  assert.equal(row.currency, 'HUF')
  assert.equal(row.note, 'Insurance')
  assert.deepEqual(row.source, { kind: 'extra', id: 'x1' })

  // the tick is about the forecast; the date is a fact about money
  const unticked = { ...base, extras: [extra({ paidOn: '2026-08-12', include: false })] } as unknown as TripState
  assert.equal(planImports(unticked, []).candidates.length, 1)

  // a visa is filed with insurance, the form's other words land where the ledger keeps them
  const visa = { ...base, extras: [extra({ id: 'x2', label: 'e-visas', category: 'Visa', paidOn: '2026-08-20' })] } as unknown as TripState
  assert.equal(planImports(visa, []).candidates[0].category, 'insurance')
})

test('an extra’s row follows the extra, and goes when the date is cleared but stays flagged when the extra is deleted', () => {
  const paid = { ...base, extras: [extra({ paidOn: '2026-08-12' })] } as unknown as TripState
  const [row] = planImports(paid, []).candidates

  // amount edited on the Trip page → the row is brought in line
  const cheaper = { ...base, extras: [extra({ paidOn: '2026-08-12', amount: 250_000 })] } as unknown as TripState
  const sync = planImports(cheaper, [row])
  assert.equal(sync.updates.length, 1)
  assert.equal(sync.updates[0].amount, 250_000)
  assert.deepEqual(sync.removals, [])

  // "not paid after all": the extra is still listed, its date is gone → delete, never flag
  const unpaid = { ...base, extras: [extra()] } as unknown as TripState
  const cleared = planImports(unpaid, [row])
  assert.deepEqual(cleared.removals.map((e) => e.id), ['le-plan-extra-x1'])
  assert.deepEqual(cleared.orphans, [])
  assert.deepEqual(cleared.candidates, [])

  // the extra itself deleted → money already spent stays on the books, flagged
  const gone = { ...base, extras: [] } as unknown as TripState
  const orphaned = planImports(gone, [row])
  assert.deepEqual(orphaned.removals, [])
  assert.equal(orphaned.orphans.length, 1)
  assert.equal(orphaned.orphans[0].orphaned, true)

  // a booking's row is never "removed", whatever happens to the booking
  const bookedStay = { ...base, stays: [stay('booked')] } as TripState
  const [stayRow] = planImports(bookedStay, []).candidates
  const stayDrafted = { ...base, stays: [stay('idea')] } as TripState
  const back = planImports(stayDrafted, [stayRow])
  assert.deepEqual(back.removals, [])
  assert.equal(back.orphans.length, 1)
})

// ---- subscription charges, written by themselves (Patrik, 24 Sep, #37) ----

const netflix: Subscription = { id: 'nf', label: 'Netflix', cur: 'HUF', amount: 4490, everyMonths: 1, anchor: '2026-08-22' }
const withSubs = (subs: Subscription[], over: Partial<TripState> = {}, meta: Record<string, string> = {}) =>
  ({ ...base, meta: { ...base.meta, startDate: '2026-08-31', endDate: '2027-04-30', ...meta }, subscriptions: subs, ...over }) as unknown as TripState
const logged = (over: Partial<LedgerEntry>): LedgerEntry =>
  ({ id: 'x', date: '2026-10-24', type: 'expense', category: 'subscriptions', amount: 4490, currency: 'HUF', note: 'netflix', ...over })

test('a subscription charge is written once its date has come, never before, and from 25 Sep only', () => {
  const state = withSubs([netflix])
  assert.deepEqual(subChargesDue(state, [], '2026-10-21'), [], 'the 22 Sep charge was theirs to log; the 22 Oct one has not come')
  const rows = subChargesDue(state, [], '2026-10-22')
  assert.deepEqual(rows.map((e) => [e.id, e.date, e.amount, e.currency, e.note, e.category, e.subId, e.source?.id]),
    [['le-sub-nf-2026-10-22', '2026-10-22', 4490, 'HUF', 'Netflix', 'subscriptions', 'nf', 'nf@2026-10-22']])
  assert.deepEqual(subChargesDue(state, [], '2026-11-30').map((e) => e.date), ['2026-10-22', '2026-11-22'], 'a long absence catches up')
  assert.deepEqual(subChargesDue(state, [], ''), [], 'no date yet, nothing')
})

test('a charge already written, deleted, logged by hand or linked is not written again', () => {
  const state = withSubs([netflix])
  const written = subChargesDue(state, [], '2026-10-22')
  assert.deepEqual(subChargesDue(state, written, '2026-10-30'), [], 'written once')
  assert.deepEqual(subChargesDue(withSubs([netflix], { importSkip: ['sub:nf@2026-10-22'] }), [], '2026-10-30'), [], 'deleted stays deleted')
  assert.deepEqual(subChargesDue(state, [logged({})], '2026-10-30'), [], 'its name, two days late, logged by hand')
  assert.deepEqual(subChargesDue(state, [logged({ note: 'Streaming', subId: 'nf' })], '2026-10-30'), [], 'linked to it')
  assert.equal(subChargesDue(state, [logged({ subId: null })], '2026-10-30').length, 1, 'an entry said not to repeat is not this charge')
  assert.equal(subChargesDue(state, [logged({ date: '2026-11-10' })], '2026-10-30').length, 1, 'more than 15 days away')
  assert.equal(subChargesDue(state, [logged({ category: 'food' })], '2026-10-30').length, 1, 'another category')
})

test('subscription charges stay inside the journey, stop at a cancellation and start at autoFrom', () => {
  assert.deepEqual(subChargesDue(withSubs([{ ...netflix, cancelledOn: '2026-11-01' }]), [], '2027-01-31').map((e) => e.date), ['2026-10-22'])
  assert.deepEqual(subChargesDue(withSubs([netflix], {}, { endDate: '2026-11-10' }), [], '2027-01-31').map((e) => e.date), ['2026-10-22'], 'the journey ended')
  assert.deepEqual(subChargesDue(withSubs([netflix], {}, { startDate: '2026-12-01' }), [], '2026-12-31').map((e) => e.date), ['2026-12-22'], 'not before departure')
  const declared = { ...netflix, anchor: '2026-10-05', autoFrom: '2026-10-06' }
  assert.deepEqual(subChargesDue(withSubs([declared]), [], '2026-11-10').map((e) => e.date), ['2026-11-05'], 'its own entry was the 5 Oct charge')
})

test('the booking sync leaves subscription charges alone: no updates, flags or removals', () => {
  const [row] = subChargesDue(withSubs([netflix]), [], '2026-10-22')
  const pricier = planImports(withSubs([{ ...netflix, amount: 5490 }]), [row], '2026-10-22')
  assert.deepEqual([pricier.updates, pricier.orphans, pricier.removals, pricier.subCharges], [[], [], [], []], 'a price rise does not rewrite October')
  assert.deepEqual(planImports(withSubs([]), [row], '2026-10-22').orphans, [], 'a deleted subscription leaves its charges')
})
