import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dailySpend, spendByCategory, burnRate, stopBurnRate, tripPace, planByStop, bookingsSummary, projectFromPlan,
  monthlyOutflow, beyondEveryday, everydayOnly,
} from './spending.ts'
import { toBase } from './format.ts'
import type { LedgerEntry, TripState, Segment } from './types.ts'
import type { PerSeg } from './budget.ts'

const rates = { HUF: 1, THB: 10, USD: 340 }
const e = (id: string, date: string, category: string, amount: number, currency = 'THB', extra: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id, date, type: 'expense', category, amount, currency, note: '', ...extra })

const ledger: LedgerEntry[] = [
  e('a', '2026-09-01', 'food', 100),
  e('b', '2026-09-01', 'drinks', 20),
  e('c', '2026-09-03', 'food', 50),
  e('d', '2026-09-03', 'transport', 1000, 'USD', { source: { kind: 'transport', id: 't1' } }),
  { id: 'inc', date: '2026-09-02', type: 'income', category: 'salary', amount: 5000, currency: 'HUF', note: '' },
]

test('dailySpend fills the quiet days and buckets by category', () => {
  const days = dailySpend(ledger, rates)
  assert.deepEqual(days.map((d) => d.date), ['2026-09-01', '2026-09-02', '2026-09-03'])
  assert.deepEqual(days[0], { date: '2026-09-01', total: 1200, byCategory: { food: 1000, drinks: 200 } })
  assert.equal(days[1].total, 0)
  assert.equal(days[2].total, 500 + 340_000)
  // an explicit window clips and can extend
  assert.equal(dailySpend(ledger, rates, { from: '2026-09-02', to: '2026-09-04' }).length, 3)
  assert.deepEqual(dailySpend([], rates), [])
})

test('spendByCategory ranks and shares within a window', () => {
  const all = spendByCategory(ledger, rates)
  assert.equal(all[0].category, 'transport')
  assert.ok(Math.abs(all.reduce((a, c) => a + c.share, 0) - 1) < 1e-9)
  const firstDay = spendByCategory(ledger, rates, { to: '2026-09-01' })
  assert.deepEqual(firstDay.map((c) => [c.category, c.total, c.count]), [['food', 1000, 1], ['drinks', 200, 1]])
})

test('burnRate ignores bookings and counts every day of the window', () => {
  const r = burnRate(ledger, rates, '2026-09-01', '2026-09-03')
  assert.deepEqual(r, { days: 3, total: 1700, perDay: 1700 / 3 })
  assert.deepEqual(burnRate(ledger, rates, '2026-09-03', '2026-09-01'), { days: 0, total: 0, perDay: 0 })
  const seg: Segment = { id: 's', country: 'TH', city: 'Bangkok', arrive: '2026-09-01', depart: '2026-09-30' }
  assert.equal(stopBurnRate(seg, ledger, rates, '2026-09-03').days, 3)
  assert.equal(stopBurnRate(seg, ledger, rates, '2026-10-15').days, 30)
})

test('tripPace prefers the current stop once it has three days, and planByStop is honest about time', () => {
  const bkk: Segment = { id: 'bkk', country: 'TH', city: 'Bangkok', arrive: '2026-09-01', depart: '2026-09-11' }
  const han: Segment = { id: 'han', country: 'VN', city: 'Hanoi', arrive: '2026-09-11', depart: '2026-09-21' }
  const state = {
    meta: { version: 1, tripName: 'T', travelers: 2, baseCurrency: 'HUF', budgetCap: 0, startDate: '2026-08-30' },
    rates,
    segments: [bkk, han],
    stays: [
      { id: 'st1', segId: 'bkk', name: 'paid', cur: 'USD', ppn: 10, include: true, status: 'chosen', chargeDate: '2026-07-09' },
      { id: 'st2', segId: 'han', name: 'future', cur: 'USD', ppn: 20, include: true, status: 'chosen', nights: 10 },
    ],
    transport: [
      { id: 't1', type: 'flight', from: 'BUD', to: 'BKK', date: '2026-08-31', cur: 'USD', price: 100, include: true, status: 'booked' },
      { id: 't2', type: 'flight', from: 'BKK', to: 'HAN', date: '2026-09-11', cur: 'USD', price: 50, include: true, status: 'idea' },
    ],
    extras: [], notes: {},
  } as TripState
  const led = [
    e('pre', '2026-08-30', 'gear', 1000, 'HUF'), // pre-trip, one-off: never in a pace
    e('a', '2026-09-01', 'food', 100), e('b', '2026-09-05', 'food', 100), // 2000 HUF over 5 days in Bangkok
  ]
  const pace = tripPace(state, led, '2026-09-05', bkk)
  assert.deepEqual(pace, { perDay: 400, days: 5, scope: 'stop' })
  assert.equal(tripPace(state, led, '2026-09-02', bkk).scope, 'trip') // 2 days at the stop, 4 since departure
  assert.equal(tripPace(state, [], '2026-08-29').scope, 'none')

  const perSeg: PerSeg[] = [
    { seg: bkk, nights: 10, tier: 1, accom: 100 * 340, accomSrc: 'included', live: 10 * 2000, total: 0, kb: undefined },
    { seg: han, nights: 10, tier: 1, accom: 200 * 340, accomSrc: 'included', live: 10 * 3000, total: 0, kb: undefined },
  ]
  const [b, h] = planByStop(state, led, perSeg, '2026-09-05', pace.perDay)
  assert.equal(b.nightsIn, 5)
  assert.equal(b.spent, 2000)
  assert.equal(b.remaining, 5)
  assert.equal(b.stayLabel, 'unpaid') // chosen, charge date set, but not in the ledger yet
  assert.equal(b.projected, 34000 + 2000 + 5 * 400)
  assert.equal(h.nightsIn, 0)
  assert.equal(h.stayLabel, 'unpaid')
  assert.equal(h.projected, 68000 + 10 * 400)
  // no pace yet → the catalogue's per-night rate carries the future
  const [, h2] = planByStop(state, led, perSeg, '2026-09-05', null)
  assert.equal(h2.rateSrc, 'catalogue')
  assert.equal(h2.projected, 68000 + 10 * 3000)

  const bk = bookingsSummary(state, led)
  assert.deepEqual(bk.stays.map((r) => [r.status, r.amount]), [['unpaid', 34000], ['unpaid', 68000]])
  assert.deepEqual(bk.transport.map((r) => [r.status, r.amount]), [['unpaid', 34000], ['unbooked', 17000]])
  assert.equal(bk.paid, 0)
  assert.equal(bk.toPay, 136000)
  assert.equal(bk.unbooked, 1)
  assert.deepEqual(bk.stays[0].original, { amount: 100, cur: 'USD' })

  // the projection reconciles with the plan rows: Σ stops + transport + residual
  const led2 = [...led, e('imp', '2026-07-09', 'stays', 100, 'USD', { source: { kind: 'stay', id: 'st1' } })]
  const plan2 = planByStop(state, led2, perSeg, '2026-09-05', 400)
  const bk2 = bookingsSummary(state, led2)
  assert.equal(plan2[0].stayLabel, 'booked')
  const pr = projectFromPlan(plan2, bk2, led2, rates, '2026-09-05')
  assert.equal(pr.spent, 1000 + 2000 + 34000)
  assert.equal(pr.remainingNights, 15)
  assert.equal(pr.unpaidStays, 68000)
  assert.equal(pr.transportToPay, 34000)
  assert.equal(pr.projected, 37000 + 15 * 400 + 68000 + 34000)
  assert.equal(pr.residual, 1000) // the pre-trip gear
  // the Plan card's rows add up to the same number: Σ stops + transport + residual
  const stops = plan2.reduce((a, p) => a + p.projected, 0)
  const transport = bk2.transport.filter((r) => r.status !== 'unbooked').reduce((a, r) => a + r.amount, 0)
  assert.equal(stops + transport + pr.residual, pr.projected)
})

// === drafts vs committed money (owner report 2026-09-15) ====================
// A tester ticked a Lisbon flat that was still a shortlist and the Money page
// billed them for it. A draft may forecast; it may never be owed.
const draftState = (stayStatus: string): TripState => ({
  meta: { version: 1, tripName: 'T', travelers: 1, baseCurrency: 'HUF', budgetCap: 0, startDate: '2026-09-01' },
  rates,
  segments: [{ id: 'lis', country: 'Portugal', city: 'Lisbon', arrive: '2026-10-01', depart: '2026-10-11' }],
  stays: [{ id: 'st', segId: 'lis', name: 'Alfama flat', cur: 'USD', ppn: 50, nights: 10, include: true, status: stayStatus }],
  transport: [],
  extras: [],
  notes: {},
}) as TripState

const lisPerSeg = (state: TripState): PerSeg[] => [
  { seg: state.segments[0], nights: 10, tier: 1, accom: 500 * 340, accomSrc: 'included', live: 0, total: 0, kb: undefined },
]

test('a ticked but unbooked stay is a draft: listed, forecast, never owed', () => {
  const drafted = draftState('shortlist')
  const bk = bookingsSummary(drafted, [])
  // still listed — the traveller asked for it in the plan
  assert.equal(bk.stays.length, 1)
  assert.equal(bk.stays[0].status, 'unbooked')
  // ...but owed to nobody
  assert.equal(bk.toPay, 0)
  assert.equal(bk.paid, 0)
  assert.equal(bk.draftStays, 1)
  assert.equal(bk.draftedStays, 170_000)

  const [stop] = planByStop(drafted, [], lisPerSeg(drafted), '2026-09-15', null)
  assert.equal(stop.stayLabel, 'draft')
  // it DOES carry the forecast: Lisbon is not in the Asia catalogue, so
  // dropping the drafted price would forecast zero accommodation for the stop
  assert.equal(stop.stay, 170_000)

  // the same stay, once it is actually chosen, becomes money owed
  const chosen = draftState('chosen')
  const bk2 = bookingsSummary(chosen, [])
  assert.equal(bk2.stays[0].status, 'unpaid')
  assert.equal(bk2.toPay, 170_000)
  assert.equal(bk2.draftStays, 0)
  assert.equal(planByStop(chosen, [], lisPerSeg(chosen), '2026-09-15', null)[0].stayLabel, 'unpaid')
})

test('expenses dated after today are scheduled, not spent', () => {
  const state = draftState('chosen')
  const led: LedgerEntry[] = [
    e('past', '2026-09-10', 'food', 100, 'HUF'),
    e('today', '2026-09-15', 'food', 50, 'HUF'),
    e('ahead', '2026-12-24', 'stays', 900, 'HUF', { source: { kind: 'stay', id: 'st' } }),
  ]
  const plan = planByStop(state, led, lisPerSeg(state), '2026-09-15', null)
  const pr = projectFromPlan(plan, bookingsSummary(state, led), led, rates, '2026-09-15')
  assert.equal(pr.spent, 150) // today counts; December does not
  assert.equal(pr.scheduled, 900)
  // the total is unchanged by the split — only its labelling
  assert.equal(pr.projected, projectFromPlan(plan, bookingsSummary(state, led), led, rates, '2026-12-31').projected)

  // and the Plan card's rows still reconcile with the projected total
  const bk = bookingsSummary(state, led)
  const stops = plan.reduce((a, p) => a + p.projected, 0)
  const transport = bk.transport.filter((r) => r.status !== 'unbooked').reduce((a, r) => a + r.amount, 0)
  assert.equal(stops + transport + pr.residual, pr.projected)
})

// === the page speaks one number (round three, 2026-09-19) ===================
// The overview, the Plan card and the monthly bars all quote the LIVE
// projection now. These two tests are what keeps them from drifting apart
// again: the bars are the projection's own terms bucketed by month, so their
// total must be the projection to the last forint.

const mState: TripState = {
  meta: { version: 1, tripName: 'T', travelers: 2, baseCurrency: 'HUF', budgetCap: 0, startDate: '2026-08-30', endDate: '2026-09-21' },
  rates,
  segments: [
    { id: 'bkk', country: 'TH', city: 'Bangkok', arrive: '2026-09-01', depart: '2026-09-11' },
    { id: 'han', country: 'VN', city: 'Hanoi', arrive: '2026-09-11', depart: '2026-09-21' },
  ],
  stays: [
    { id: 'st1', segId: 'bkk', name: 'paid', cur: 'USD', ppn: 10, include: true, status: 'chosen', chargeDate: '2026-07-09' },
    { id: 'st2', segId: 'han', name: 'future', cur: 'USD', ppn: 20, nights: 10, include: true, status: 'chosen' },
  ],
  transport: [
    { id: 't1', type: 'flight', from: 'BUD', to: 'BKK', date: '2026-08-31', cur: 'USD', price: 100, include: true, status: 'booked' },
    { id: 't3', type: 'train', from: 'HAN', to: 'HUE', date: '2026-10-05', cur: 'USD', price: 20, include: true, status: 'booked' },
  ],
  extras: [], notes: {},
} as TripState

const mLedger: LedgerEntry[] = [
  e('gear', '2026-08-30', 'gear', 1000, 'HUF'),
  e('sub1', '2026-09-02', 'subscriptions', 3290, 'HUF'),
  e('f1', '2026-09-01', 'food', 100),
  e('f2', '2026-09-05', 'food', 100),
  e('imp', '2026-07-09', 'stays', 100, 'USD', { source: { kind: 'stay', id: 'st1' } }),
  e('fly', '2026-08-31', 'transport', 100, 'USD', { source: { kind: 'transport', id: 't1' } }),
]
const mPerSeg: PerSeg[] = [
  { seg: mState.segments[0], nights: 10, tier: 1, accom: 100 * 340, accomSrc: 'included', live: 20_000, total: 0, kb: undefined },
  { seg: mState.segments[1], nights: 10, tier: 1, accom: 200 * 340, accomSrc: 'included', live: 30_000, total: 0, kb: undefined },
]
const mSubs = [{ date: '2026-09-14', amount: 3290 }, { date: '2026-10-14', amount: 3290 }]

test('the monthly bars are the projection, bucketed — the totals tie exactly', () => {
  const today = '2026-09-05'
  const plan = planByStop(mState, mLedger, mPerSeg, today, 400)
  const bk = bookingsSummary(mState, mLedger)
  const subsAhead = mSubs.reduce((a, c) => a + c.amount, 0)
  const pr = projectFromPlan(plan, bk, mLedger, rates, today, subsAhead)
  const { months, total } = monthlyOutflow(mState, plan, bk, mLedger, mSubs, today)

  // THE invariant: nothing is lost and nothing is counted twice
  assert.ok(Math.abs(total - pr.projected) < 1e-9, `${total} vs ${pr.projected}`)
  assert.equal(pr.subsAhead, 6580)
  // and it is still the sum of the Plan card's own rows
  const stops = plan.reduce((a, p) => a + p.projected, 0)
  const transport = bk.transport.filter((r) => r.status !== 'unbooked').reduce((a, r) => a + r.amount, 0)
  assert.ok(Math.abs(stops + transport + pr.residual + pr.subsAhead - pr.projected) < 1e-9)

  assert.deepEqual(months.map((m) => m.key), ['2026-07', '2026-08', '2026-09', '2026-10'])
  const by = Object.fromEntries(months.map((m) => [m.key, m]))
  // July: only the stay charged then
  assert.deepEqual([by['2026-07'].stays, by['2026-07'].total], [34_000, 34_000])
  // August: the flight, and the pre-trip gear as living (it is no stop's)
  assert.deepEqual([by['2026-08'].transport, by['2026-08'].living], [34_000, 1000])
  // October: the unpaid train on its date, and one subscription charge —
  // a month with no nights in it still has money leaving the account
  assert.deepEqual([by['2026-10'].transport, by['2026-10'].subs, by['2026-10'].living], [6800, 3290, 0])
  // September: the Hanoi stay lands on arrival (no charge date of its own)
  assert.equal(by['2026-09'].stays, 68_000)
  assert.equal(by['2026-09'].subs, 3290 + 3290) // one logged, one still ahead
})

test('beyondEveryday says out loud what the per-day rate leaves out', () => {
  const today = '2026-09-05'
  const b = beyondEveryday(mLedger, rates, today)
  // gear 1000 + subscriptions 3290 + stay 34 000 + flight 34 000; the two
  // food rows are the everyday ones and stay out of it
  assert.equal(b.total, 72_290)
  assert.deepEqual(b.rows.map((r) => [r.category, r.amount]), [
    ['stays', 34_000], ['transport', 34_000], ['subscriptions', 3290], ['gear', 1000],
  ])
  // it ties to the rate's own basis by construction
  const settled = mLedger.filter((x) => x.date <= today)
  const sum = (rows: LedgerEntry[]) => rows.reduce((a, x) => a + toBase(x.amount, x.currency, rates), 0)
  const spent = sum(settled)
  const everyday = sum(everydayOnly(settled))
  assert.equal(b.total, spent - everyday)
  // scheduled rows are not "spent so far" and never reach this figure
  assert.equal(beyondEveryday([...mLedger, e('ahead', '2026-12-01', 'gear', 500, 'HUF')], rates, today).total, 72_290)
})

test('a row the plan wrote is never everyday, whatever its category (a paid one-off from before #39, under health)', () => {
  const vaccine = e('le-plan-extra-x9', '2026-09-02', 'health', 3000, 'THB', { source: { kind: 'extra', id: 'x9' } })
  const pharmacy = e('h1', '2026-09-02', 'health', 100)
  const rows = [...ledger, vaccine, pharmacy]
  // the hand-typed pharmacy run is everyday; the planned vaccine is not
  assert.deepEqual(everydayOnly(rows).map((r) => r.id).sort(), ['a', 'b', 'c', 'h1'])
  // ...so it neither lifts the per-day rate
  assert.equal(burnRate(rows, rates, '2026-09-01', '2026-09-03').total, burnRate([...ledger, pharmacy], rates, '2026-09-01', '2026-09-03').total)
  // ...nor falls between the two figures: it is counted beyond the everyday
  const beyond = beyondEveryday(rows, rates, '2026-09-03')
  assert.equal(beyond.rows.find((r) => r.category === 'health')?.amount, 3000 * 10)
})

// #36 (Patrik, 26 Sep): the 90 000 Ft concert ticket logged as Activities on
// 3 Sep lifted the pace, and the projection multiplies the pace by every night
// left. An entry's own switch now overrides its category, one rule for all.
test('an entry’s own switch moves it in or out of the daily average, but never a booking or a subscription', () => {
  const days = [
    e('m1', '2026-09-01', 'food', 1500, 'HUF'),
    e('m2', '2026-09-02', 'food', 1500, 'HUF'),
    e('m3', '2026-09-03', 'food', 1500, 'HUF'),
  ]
  const concert = e('show', '2026-09-03', 'activities', 90_000, 'HUF', { note: 'Concert tickets' })
  const rate = (rows: LedgerEntry[]) => burnRate(rows, rates, '2026-09-01', '2026-09-03').perDay
  assert.equal(rate([...days, concert]), 31_500, 'unmarked, the ticket is a day of Bangkok')
  assert.equal(rate([...days, { ...concert, everyday: false }]), 1500, 'left out by its own switch')
  // gear is out by default, and in when the entry says so
  assert.equal(rate([...days, e('bag', '2026-09-02', 'gear', 3000, 'HUF')]), 1500)
  assert.equal(rate([...days, e('bag', '2026-09-02', 'gear', 3000, 'HUF', { everyday: true })]), 2500)
  // the projection adds these on their own: counted in the pace too, they would count twice
  for (const cat of ['stays', 'transport', 'subscriptions']) {
    assert.equal(rate([...days, e('x', '2026-09-02', cat, 3000, 'HUF', { everyday: true })]), 1500, cat)
  }
  // a row the plan wrote is never day-to-day, whatever it says
  assert.equal(rate([...days, e('p', '2026-09-02', 'food', 3000, 'HUF', { everyday: true, source: { kind: 'extra', id: 'x' } })]), 1500)
  // the chart and Where it goes read the same rule
  assert.deepEqual(everydayOnly([...days, { ...concert, everyday: false }]).map((r) => r.id), ['m1', 'm2', 'm3'])
})

test('beyondEveryday names an entry left out by its own switch, not its whole category', () => {
  const rows = [
    e('m1', '2026-09-01', 'food', 1500, 'HUF'),
    e('show', '2026-09-03', 'activities', 90_000, 'HUF', { note: 'Concert tickets', everyday: false }),
    e('bag', '2026-09-02', 'gear', 3000, 'HUF'),
  ]
  const b = beyondEveryday(rows, rates, '2026-09-03')
  assert.equal(b.total, 93_000)
  assert.deepEqual(b.rows, [
    { category: 'activities', amount: 90_000, label: 'Concert tickets' },
    { category: 'gear', amount: 3000 },
  ])
})
