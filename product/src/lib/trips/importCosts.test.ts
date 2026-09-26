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

// ---- one-offs removed (#39, Patrik, 26 Sep) ------------------------------------

const extraRow = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'le-plan-extra-x1', date: '2026-08-12', type: 'expense', category: 'insurance', amount: 274_000,
  currency: 'HUF', note: 'Insurance', source: { kind: 'extra', id: 'x1' }, ...over,
})

test('a paid one-off’s row becomes a plain entry, still out of the daily average', () => {
  const insurance = extraRow()
  const vaccine = extraRow({ id: 'le-plan-extra-x2', category: 'health', note: 'Vaccines', source: { kind: 'extra', id: 'x2' } })
  const orphan = extraRow({ id: 'le-plan-extra-x3', note: 'Old visa', orphaned: true, source: { kind: 'extra', id: 'x3' } })
  // the planned list no longer imports anything, whatever it holds
  const legacy = { ...base, extras: [{ id: 'x9', label: 'Gear', cur: 'HUF', amount: 5000, include: true, paidOn: '2026-08-20' }] } as unknown as TripState
  const plan = planImports(legacy, [insurance, vaccine, orphan])
  assert.deepEqual(plan.candidates, [])
  assert.deepEqual(plan.orphans, [], 'a one-off’s row is never flagged "extra removed"')
  const [a, b, c] = plan.updates
  assert.deepEqual(a, { id: 'le-plan-extra-x1', date: '2026-08-12', type: 'expense', category: 'insurance', amount: 274_000, currency: 'HUF', note: 'Insurance' },
    'insurance is out of the daily average by its category: no flag needed')
  assert.equal(b.everyday, false, 'a vaccine under Health says so itself')
  assert.equal(b.source, undefined)
  assert.equal(c.orphaned, undefined, 'the payment happened: no "extra removed"')
  // once plain, there is nothing left to do
  assert.deepEqual(planImports(legacy, plan.updates).updates, [])
})

test('a booking’s row is still flagged, never removed, when the booking goes', () => {
  const bookedStay = { ...base, stays: [stay('booked')] } as TripState
  const [stayRow] = planImports(bookedStay, []).candidates
  const stayDrafted = { ...base, stays: [stay('idea')] } as TripState
  const back = planImports(stayDrafted, [stayRow])
  assert.equal(back.orphans.length, 1)
  assert.equal(back.orphans[0].orphaned, true)
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

test('the booking sync leaves subscription charges alone: no updates or flags', () => {
  const [row] = subChargesDue(withSubs([netflix]), [], '2026-10-22')
  const pricier = planImports(withSubs([{ ...netflix, amount: 5490 }]), [row], '2026-10-22')
  assert.deepEqual([pricier.updates, pricier.orphans, pricier.subCharges], [[], [], []], 'a price rise does not rewrite October')
  assert.deepEqual(planImports(withSubs([]), [row], '2026-10-22').orphans, [], 'a deleted subscription leaves its charges')
})
