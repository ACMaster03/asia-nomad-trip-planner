import { test } from 'node:test'
import assert from 'node:assert/strict'
import { legacyUnlocked, moneyUnlocks, moreLine } from './unlocks.ts'
import type { Pace } from './spending.ts'
import type { LedgerEntry } from './types.ts'

const e = (id: string, date: string, category: string, extra: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id, date, type: 'expense', category, amount: 100, currency: 'HUF', note: '', ...extra })
const pace = (days: number): Pace => (days >= 3 ? { perDay: 1000, days, scope: 'stop' } : { perDay: null, days: 0, scope: 'none' })
const START = '2026-08-31'
// Asia, as the mock replays it: the Bangkok stay charged in July, gear before
// departure, the flight on day 1 (imported), an airport meal that evening.
const before = [
  e('stay', '2026-07-09', 'stays', { source: { kind: 'stay', id: 'st1' } }),
  e('pack', '2026-08-20', 'gear'),
]
const day1 = [...before, e('flight', START, 'transport', { source: { kind: 'transport', id: 't1' } }), e('meal', START, 'food')]

test('an empty journey shows nothing that needs data', () => {
  const u = moneyUnlocks({ ledger: [], todayIso: START, tripStart: START, pace: pace(0) })
  assert.deepEqual([u.first, u.beyond, u.chart, u.range, u.where, u.projection], [false, false, false, false, false, false])
  assert.equal(moreLine(u), 'More appears as you log: a chart after 3 days, a projection after a week.')
})

test('before departure: the overview, but no beyond-the-everyday strip yet', () => {
  const u = moneyUnlocks({ ledger: before, todayIso: '2026-08-25', tripStart: START, pace: pace(0) })
  assert.equal(u.first, true, 'an import counts as the first entry')
  assert.equal(u.beyond, false, 'only pre-departure non-daily rows')
})

test('day 1: the overview and the strip; no chart, no projection', () => {
  const u = moneyUnlocks({ ledger: day1, todayIso: START, tripStart: START, pace: pace(0) })
  assert.equal(u.first, true)
  assert.equal(u.beyond, true, 'the flight on departure day')
  assert.deepEqual([u.chart, u.range, u.where, u.projection], [false, false, false, false])
})

test('day 4: three days with everyday entries in three families bring the chart and Where it goes', () => {
  const ledger = [...day1, e('a', '2026-09-01', 'drinks'), e('b', '2026-09-02', 'personal-care'), e('c', '2026-09-02', 'clothes')]
  const u = moneyUnlocks({ ledger, todayIso: '2026-09-03', tripStart: START, pace: pace(3) })
  assert.equal(u.chart, true)
  assert.equal(u.where, true, 'food & drinks, health & care, clothes & accessories')
  assert.equal(u.range, false, 'the switch waits for 14 days')
  assert.equal(u.projection, false, 'three days of pace is not a week')
  assert.equal(u.firstEveryday, START)
  assert.equal(moreLine(u), 'More appears as you log: a projection after a week.')
})

test('day 9: a week of pace brings the projection, and the last line goes', () => {
  const ledger = [...day1, e('a', '2026-09-01', 'drinks'), e('b', '2026-09-02', 'food')]
  const u = moneyUnlocks({ ledger, todayIso: '2026-09-08', tripStart: START, pace: pace(8) })
  assert.equal(u.projection, true)
  assert.equal(u.where, false, 'one family is not three')
  assert.equal(moreLine(u), null)
})

test('a week of pace with nothing logged is no projection', () => {
  const u = moneyUnlocks({ ledger: day1.slice(0, 3), todayIso: '2026-09-08', tripStart: START, pace: pace(8) })
  assert.equal(u.projection, false)
})

test('the switch appears at 14 days with everyday entries; imports and future rows do not count', () => {
  const ledger = Array.from({ length: 14 }, (_, i) => e(`d${i}`, `2026-09-${String(i + 1).padStart(2, '0')}`, 'food'))
  assert.equal(moneyUnlocks({ ledger, todayIso: '2026-09-20', tripStart: START, pace: pace(20) }).range, true)
  const thirteen = [...ledger.slice(0, 13), e('later', '2026-10-01', 'food'), e('imp', '2026-09-14', 'food', { source: { kind: 'extra', id: 'x' } })]
  assert.equal(moneyUnlocks({ ledger: thirteen, todayIso: '2026-09-20', tripStart: START, pace: pace(20) }).range, false)
})

test('a recorded card stays when the data no longer qualifies, and is not recorded twice', () => {
  const recorded = { chart: '2026-09-03', where: '2026-09-03' }
  const u = moneyUnlocks({ ledger: day1, todayIso: '2026-09-05', tripStart: START, pace: pace(5), recorded })
  assert.equal(u.chart, true, 'entries were deleted, the chart stays')
  assert.equal(u.where, true)
  assert.equal(u.met.chart, false)
  const ledger = [...day1, e('a', '2026-09-01', 'drinks'), e('b', '2026-09-02', 'food')]
  const v = moneyUnlocks({ ledger, todayIso: '2026-09-08', tripStart: START, pace: pace(8), recorded })
  assert.deepEqual(v.toRecord, ['projection'], 'only what is new gets written')
})

test('a journey created before round 2 looks as it did: everything, and nothing to save', () => {
  const OLD = '2026-07-01T10:00:00.000Z'
  assert.deepEqual(legacyUnlocked(OLD), { chart: '2026-07-01', range: '2026-07-01', where: '2026-07-01', projection: '2026-07-01' })
  const u = moneyUnlocks({ ledger: day1, todayIso: '2026-09-23', tripStart: START, pace: pace(23), createdAt: OLD })
  assert.deepEqual([u.first, u.beyond, u.chart, u.range, u.where, u.projection], [true, true, true, true, true, true], 'nothing vanishes from Asia')
  assert.deepEqual(u.toRecord, [], 'opening Money saves nothing to it')
  assert.equal(moreLine(u), null)
  // before departure and with nothing logged, as the page was before round 2
  const empty = moneyUnlocks({ ledger: [], todayIso: '2026-08-25', tripStart: START, pace: pace(0), createdAt: OLD })
  assert.deepEqual([empty.first, empty.beyond, empty.chart, empty.projection], [true, true, true, true])
  // whatever it saved, it keeps all four
  const saved = moneyUnlocks({ ledger: day1, todayIso: '2026-09-23', tripStart: START, pace: pace(23), createdAt: OLD, recorded: { chart: '2026-09-02' } })
  assert.deepEqual([saved.range, saved.where, saved.projection, saved.toRecord.length], [true, true, true, 0])
  // a journey made after the line starts short, like any new one
  const fresh = moneyUnlocks({ ledger: day1, todayIso: START, tripStart: START, pace: pace(1), createdAt: '2026-09-23T18:00:00+00:00' })
  assert.deepEqual([fresh.chart, fresh.projection], [false, false])
})

test('the line between old and new journeys is a moment on 23 Sep, whatever offset the timestamp carries', () => {
  assert.ok(legacyUnlocked('2026-09-23T09:44:59.123456+00:00'), 'made just before')
  assert.equal(legacyUnlocked('2026-09-23T18:00:00+00:00'), undefined, 'made the same evening')
  assert.equal(legacyUnlocked('2026-09-23T11:50:00+02:00'), undefined, '09:50 UTC, written in Budapest time')
  assert.ok(legacyUnlocked('2026-09-23T11:40:00+02:00'), '09:40 UTC, written in Budapest time')
  assert.equal(legacyUnlocked('2026-09-24T08:00:00.000Z'), undefined)
  assert.equal(legacyUnlocked(undefined), undefined, 'a journey still being created is new')
})
