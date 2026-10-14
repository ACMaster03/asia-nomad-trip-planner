import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  daySections, daysToShow, dayTitle, focusFromParams, focusTitle, isFocused, matching, NO_FOCUS, splitRows, summaryLine, usedCategories, weekdayLabel,
} from './ledgerFilters.ts'
import type { LedgerEntry } from './types.ts'

const e = (id: string, date: string, amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id, date, type: 'expense', category: 'food', amount, currency: 'HUF', note: '', ...extra })
const rates = { HUF: 1, USD: 340, THB: 10 }
const TODAY = '2026-09-14'
const START = '2026-08-31'
const fmt = (n: number) => `${Math.round(n)} Ft`

// In the stored order: the plan's rows first, then what was typed, as the app writes them.
const ledger = [
  e('flight', '2026-08-31', 248_000, { category: 'transport', note: 'flight Budapest → Bangkok', source: { kind: 'transport', id: 't1' } }),
  e('stay', '2026-09-29', 1276, { currency: 'USD', category: 'stays', note: 'Văn Giang (Mai Kenny)', source: { kind: 'stay', id: 'st2' } }),
  e('gear', '2026-08-20', 64_900, { category: 'gear', note: 'Osprey backpack' }),
  e('pho', '2026-09-12', 120, { currency: 'THB', note: 'Phở Thìn' }),
  e('grab', '2026-09-12', 300, { currency: 'THB', category: 'local-transport', note: 'Grab' }),
  e('concert', '2026-09-03', 90_000, { category: 'activities', note: 'Concert tickets', everyday: false }),
  e('icloud', '2026-09-14', 3290, { category: 'subscriptions', note: 'iCloud 2 TB', source: { kind: 'sub', id: 'sub-icloud@2026-09-14' } }),
  e('coffee', '2026-09-14', 170, { currency: 'THB', category: 'drinks', note: 'Iced coffees' }),
  e('invoice', '2026-09-01', 420_000, { type: 'income', category: 'freelance', note: 'August invoice' }),
  e('netflix', '2026-10-01', 4490, { category: 'subscriptions', note: 'Netflix', source: { kind: 'sub', id: 'sub-netflix@2026-10-01' } }),
]
const ids = (rows: LedgerEntry[]) => rows.map((x) => x.id)

test('All keeps everything; the filters follow the phone', () => {
  assert.equal(matching(ledger, NO_FOCUS).length, ledger.length)
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, filter: 'everyday' })), ['pho', 'grab', 'coffee'])
  // beyond: the plan's rows, gear, a ticket switched out of the daily average, the subscriptions
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, filter: 'beyond' })), ['flight', 'stay', 'gear', 'concert', 'icloud', 'netflix'])
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, filter: 'bookings' })), ['flight', 'stay'])
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, filter: 'subscriptions' })), ['icloud', 'netflix'])
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, filter: 'income' })), ['invoice'])
})

test('a category, a family, a span and before departure narrow on top of the filter', () => {
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, category: 'drinks' })), ['coffee'])
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, family: 'food', filter: 'everyday' })), ['pho', 'coffee'])
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, span: { from: '2026-09-12', to: '2026-09-13' } })), ['pho', 'grab'])
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, before: START })), ['gear'])
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, filter: 'beyond', span: { from: '2026-09-01', to: '2026-09-14' } })), ['concert', 'icloud'])
})

test('the search matches the name and the category, accents off, every word', () => {
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, query: 'pho' })), ['pho'])
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, query: 'icloud tb' })), ['icloud'])
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, query: 'getting around' })), ['grab'])
  assert.deepEqual(ids(matching(ledger, { ...NO_FOCUS, query: 'Subscriptions', filter: 'income' })), [])
})

test('the rows split at today: logged newest first, the stored order within a day; coming soonest first', () => {
  const { past, coming } = splitRows(matching(ledger, NO_FOCUS), ledger, TODAY)
  assert.deepEqual(ids(past), ['coffee', 'icloud', 'grab', 'pho', 'concert', 'invoice', 'flight', 'gear'])
  assert.deepEqual(ids(coming), ['stay', 'netflix'])
})

test('day sections carry the day, in the base currency, expenses only', () => {
  const { past } = splitRows(matching(ledger, NO_FOCUS), ledger, TODAY)
  const days = daySections(past, rates)
  assert.deepEqual(days.map((d) => [d.date, d.entries.length, d.spent]), [
    ['2026-09-14', 2, 3290 + 1700],
    ['2026-09-12', 2, 1200 + 3000],
    ['2026-09-03', 1, 90_000],
    ['2026-09-01', 1, 0],
    ['2026-08-31', 1, 248_000],
    ['2026-08-20', 1, 64_900],
  ])
})

test('paging shows whole days, and reaches the day a link asked for', () => {
  const { past } = splitRows(matching(ledger, NO_FOCUS), ledger, TODAY)
  const days = daySections(past, rates)
  assert.equal(daysToShow(days, 1, null), 1)
  assert.equal(daysToShow(days, 3, null), 2)
  assert.equal(daysToShow(days, 4, null), 2)
  assert.equal(daysToShow(days, 100, null), days.length)
  assert.equal(daysToShow(days, 1, '2026-08-31'), 5)
  assert.equal(daysToShow(days, 1, '2000-01-01'), 1)
})

test('the summary line counts the logged rows, spent and received', () => {
  const { past } = splitRows(matching(ledger, { ...NO_FOCUS, span: { from: '2026-09-01', to: '2026-09-14' } }), ledger, TODAY)
  assert.equal(summaryLine(past, rates, fmt), '6 entries · 99190 Ft spent · 420000 Ft received')
  assert.equal(summaryLine([ledger[3]], rates, fmt), '1 entry · 1200 Ft spent')
})

test('day titles: today, yesterday, day 1', () => {
  assert.equal(weekdayLabel('2026-10-14'), 'Wed 14 Oct')
  assert.equal(dayTitle('2026-10-14', '2026-10-14', START), 'Today · Wed 14 Oct')
  assert.equal(dayTitle('2026-10-13', '2026-10-14', START), 'Yesterday · Tue 13 Oct')
  assert.equal(dayTitle('2026-08-31', '2026-10-14', START), 'Mon 31 Aug · day 1')
  assert.equal(dayTitle('2026-08-31', '2026-08-31', START), 'Today · Mon 31 Aug · day 1')
  assert.equal(dayTitle('2026-09-03', '2026-10-14'), 'Thu 3 Sep')
})

test('the categories used, most used first, then by id', () => {
  assert.deepEqual(usedCategories(ledger).slice(0, 4), [
    { id: 'subscriptions', count: 2 }, { id: 'activities', count: 1 }, { id: 'drinks', count: 1 }, { id: 'food', count: 1 },
  ])
})

test('the focus a link asks for', () => {
  assert.deepEqual(focusFromParams({}, START), { focus: NO_FOCUS, day: null, coming: false })
  assert.equal(isFocused(NO_FOCUS), false)
  const before = focusFromParams({ before: '1' }, START).focus
  assert.equal(before.before, START)
  assert.equal(focusFromParams({ before: '1' }).focus.before, null)
  const span = focusFromParams({ from: '2026-09-01', to: '2026-09-14', filter: 'beyond' }, START).focus
  assert.deepEqual(span.span, { from: '2026-09-01', to: '2026-09-14' })
  assert.equal(span.filter, 'beyond')
  assert.equal(focusFromParams({ from: '2026-09-14', to: '2026-09-01' }, START).focus.span, null)
  const fam = focusFromParams({ fam: 'food', from: '2026-09-01', to: '2026-09-14' }, START).focus
  assert.equal(fam.family, 'food')
  assert.equal(fam.filter, 'everyday')
  assert.equal(focusTitle(fam), 'Food & drinks')
  assert.equal(focusFromParams({ fam: 'nope' }, START).focus.family, null)
  assert.equal(focusTitle(focusFromParams({ cat: 'drinks' }, START).focus), 'Drinks')
  assert.equal(focusTitle(NO_FOCUS), 'All entries')
  assert.deepEqual(focusFromParams({ day: '2026-09-12', coming: '1' }, START), { focus: NO_FOCUS, day: '2026-09-12', coming: true })
  assert.equal(focusFromParams({ day: 'yesterday' }, START).day, null)
  assert.equal(focusFromParams({ filter: 'nope' }, START).focus.filter, 'all')
})
