import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chargeSoon, chargesBetween, isCancelled, monthlyRunRate, nextCharge, ordinalDay, scheduleLabel, shiftMonths, subsBetween, subsCharges,
} from './subscriptions.ts'
import type { Subscription } from './types.ts'

const rates = { HUF: 1, EUR: 395 }
const sub = (over: Partial<Subscription> & Pick<Subscription, 'id' | 'amount' | 'anchor'>): Subscription => ({
  label: over.id, cur: 'HUF', everyMonths: 1, ...over,
})

// FIXTURES.md, "Subscriptions canon". Anchors sit before departure (Aug 31
// 2026) because they are KNOWN past charges — the schedule hangs off them.
const CANON: Subscription[] = [
  sub({ id: 'icloud', amount: 3290, anchor: '2026-08-14' }),
  sub({ id: 'spotify', amount: 2490, anchor: '2026-08-17' }),
  sub({ id: 'internet', amount: 7990, anchor: '2026-08-23', remind: true, leadDays: 3 }),
  sub({ id: 'domain', amount: 18_000, anchor: '2025-11-12', everyMonths: 12, remind: true, leadDays: 7 }),
  sub({ id: 'netflix', amount: 4490, anchor: '2026-08-20', cancelledOn: '2026-09-06' }),
]
const TODAY = '2026-09-12'
const TOMORROW = '2026-09-13'
const TRIP_END = '2027-02-25'

test('the next charge is arithmetic on the anchor, and the anchor day is inclusive', () => {
  assert.equal(nextCharge(CANON[0], TODAY), '2026-09-14')
  assert.equal(nextCharge(CANON[1], TODAY), '2026-09-17')
  assert.equal(nextCharge(CANON[2], TODAY), '2026-09-23')
  assert.equal(nextCharge(CANON[3], TODAY), '2026-11-12') // yearly, anchored a year earlier
  // the day itself still counts as due; the day after rolls to the next period
  assert.equal(nextCharge(CANON[0], '2026-09-14'), '2026-09-14')
  assert.equal(nextCharge(CANON[0], '2026-09-15'), '2026-10-14')
  // asking from before the anchor gives the anchor, not a negative period
  assert.equal(nextCharge(CANON[0], '2020-01-01'), '2026-08-14')
  // every N months
  assert.equal(nextCharge(sub({ id: 'q', amount: 1, anchor: '2026-01-10', everyMonths: 3 }), TODAY), '2026-10-10')
})

test('a month-end anchor clamps to the short month and then snaps back — never sticky', () => {
  const s = sub({ id: 'eom', amount: 1000, anchor: '2026-01-31' })
  assert.equal(shiftMonths('2026-01-31', 1), '2026-02-28')
  assert.deepEqual(chargesBetween(s, '2026-02-01', '2026-05-01'), ['2026-02-28', '2026-03-31', '2026-04-30'])
  // a leap February, and a yearly anchored on it
  assert.equal(shiftMonths('2024-02-29', 12), '2025-02-28')
  assert.equal(shiftMonths('2024-01-31', 1), '2024-02-29')
})

test('cancelled is a state: prediction stops, the charge on the cancellation day never fires', () => {
  assert.ok(isCancelled(CANON[4]))
  assert.equal(nextCharge(CANON[4], TODAY), null)
  assert.deepEqual(chargesBetween(CANON[4], '2026-09-01', '2027-01-01'), [])
  // you stopped it THAT day, so that day's charge is gone; the day after, it stood
  const onTheDay = sub({ id: 'x', amount: 100, anchor: '2026-08-20', cancelledOn: '2026-09-20' })
  const dayAfter = sub({ id: 'y', amount: 100, anchor: '2026-08-20', cancelledOn: '2026-09-21' })
  assert.equal(nextCharge(onTheDay, '2026-09-01'), null)
  assert.equal(nextCharge(dayAfter, '2026-09-01'), '2026-09-20')
  // History is untouched — the charge before the cancellation is still in the
  // series. Nothing is invented BEFORE the anchor, though: what happened
  // earlier is the ledger's record, not something to predict backwards.
  assert.deepEqual(chargesBetween(CANON[4], '2026-07-01', '2026-09-06'), ['2026-08-20'])
  assert.deepEqual(chargesBetween(CANON[0], '2020-01-01', '2026-08-14'), ['2026-08-14'])
})

test('the monthly run-rate amortises; what the trip actually pays counts the charges', () => {
  // 3290 + 2490 + 7990 + 18000/12 — the cancelled one is out of it
  assert.equal(monthlyRunRate(CANON, rates), 15_270)

  const counted = subsBetween(CANON, rates, TOMORROW, TRIP_END)
  // 6 monthly charges each for iCloud / Spotify / internet, plus ONE domain
  // renewal on 12 Nov, which falls inside the trip.
  assert.equal(counted, 6 * 3290 + 6 * 2490 + 6 * 7990 + 18_000)
  assert.equal(counted, 100_620)

  // Why this is not the amortised figure the mock quoted (≈84 000): spreading
  // 15 270/month over the 166 days left bills 1/12 of the yearly domain fee per
  // month (~8 700 of it) when the whole 18 000 actually leaves the account on
  // 12 Nov. Amortising UNDERSTATES the cash by the part of a yearly renewal
  // that falls inside the window, and it cannot place a charge in a month —
  // which the monthly bars have to do.
  const amortised = (15_270 * 166) / (365 / 12)
  assert.ok(counted - amortised > 16_000, 'counted charges exceed the amortised run-rate')

  // cancelled contributes nothing ahead, however it is counted
  assert.equal(subsBetween([CANON[4]], rates, TOMORROW, TRIP_END), 0)
  // a yearly renewal outside the window costs the trip nothing
  assert.equal(subsBetween([CANON[3]], rates, '2026-12-01', TRIP_END), 0)
})

test('charges come back dated and sorted, ready to bucket by month', () => {
  const rows = subsCharges(CANON, rates, TOMORROW, TRIP_END)
  assert.equal(rows.length, 19) // 6 + 6 + 6 + 1
  assert.deepEqual(rows.slice(0, 3).map((r) => [r.date, r.amount]), [
    ['2026-09-14', 3290], ['2026-09-17', 2490], ['2026-09-23', 7990],
  ])
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].date <= r.date))
  assert.equal(rows.reduce((a, r) => a + r.amount, 0), 100_620)
  // a non-base currency converts once, per charge
  const eur = sub({ id: 'e', amount: 10, cur: 'EUR', anchor: '2026-09-20' })
  assert.equal(subsCharges([eur], rates, TOMORROW, '2026-10-01')[0].amount, 3950)
})

test('labels say the schedule out loud', () => {
  assert.equal(ordinalDay('2026-09-23'), 'the 23rd')
  assert.equal(ordinalDay('2026-09-01'), 'the 1st')
  assert.equal(ordinalDay('2026-09-02'), 'the 2nd')
  assert.equal(ordinalDay('2026-09-11'), 'the 11th')
  assert.equal(ordinalDay('2026-09-22'), 'the 22nd')
  assert.equal(scheduleLabel(CANON[2], TODAY), 'monthly · the 23rd')
  assert.equal(scheduleLabel(CANON[3], TODAY), 'yearly · next 12 Nov')
  assert.equal(scheduleLabel(sub({ id: 'q', amount: 1, anchor: '2026-01-10', everyMonths: 3 }), TODAY), 'every 3 months · next 10 Oct')
})

test('a broken subscription predicts nothing rather than throwing', () => {
  assert.equal(nextCharge(sub({ id: 'bad', amount: 1, anchor: '' }), TODAY), null)
  assert.equal(nextCharge(sub({ id: 'bad2', amount: 1, anchor: 'not-a-date' }), TODAY), null)
  assert.deepEqual(chargesBetween(sub({ id: 'ok', amount: 1, anchor: '2026-09-14' }), TRIP_END, TOMORROW), [])
  // a zero/NaN cadence falls back to monthly instead of spinning
  assert.equal(chargesBetween(sub({ id: 'z', amount: 1, anchor: '2026-09-14', everyMonths: 0 }), TOMORROW, '2026-11-01').length, 2)
})

test('chargeSoon: the soonest live charge within a week, today included; cancelled ones never', () => {
  assert.deepEqual(chargeSoon(CANON, TODAY), { sub: CANON[0], inDays: 2 }, 'iCloud on the 14th')
  assert.equal(chargeSoon(CANON, '2026-09-14')?.inDays, 0, 'a charge today counts')
  assert.equal(chargeSoon(CANON, '2026-09-15')?.sub.id, 'spotify', 'iCloud has moved to next month')
  assert.equal(chargeSoon(CANON, '2026-09-24'), null, 'nothing until 14 Oct')
  assert.equal(chargeSoon(CANON, '2026-09-24', 30)?.sub.id, 'icloud')
  assert.equal(chargeSoon([CANON[4]], '2026-09-18'), null, 'Netflix was cancelled on 6 Sep')
})
