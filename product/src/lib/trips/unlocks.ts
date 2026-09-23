import type { LedgerEntry } from './types'
import { isEverydayRow, type Pace } from './spending.ts'
import { groupOf } from './categories.ts'
import { isSettled } from './commitment.ts'

// === Money starts short and earns its cards (mock 16 §6, #62) ===
//
// Each card appears once the journey has the smallest amount of data it can
// be honest about. Per journey: a new journey starts at the top of the table
// again. The thresholds, from the mock's unlock table:
//
//   the overview, Latest, the ledger   the first entry, imports included
//   the beyond-the-everyday strip      a non-daily entry on or after departure
//   daily spend                        3 days with everyday entries
//   its 7/14/30/90 switch and arrows   14 days with everyday entries
//   where it goes                      everyday entries in 3 colour families
//   projected total, and the Plan      7 days of pace (Patrik, 22 Sep)
//
// The projection also waits for the chart. The shipped pace is a rate over
// days in the stop, logged or not, so a week with nothing logged would
// "unlock" a projection of 0 Ft a day; no card is honest about that.
//
// A card that has appeared never disappears again on that journey: thresholds
// gate only the first appearance, so the page does not breathe in and out as
// entries are edited or deleted. The day each of the four data-hungry cards
// first qualified is recorded in the trip document (state.moneyUnlocked) by
// whoever can edit it; see MoneyPage.
//
// The same rule covers the journeys that already existed: before round 2 every
// card was on every Money page, so a journey created before round 2 shipped
// looks as it did, every card, the overview and its strip included
// (legacyUnlocked). Only a journey made after it starts short. Caught in the
// preview before the merge: Asia's test data has 12 days with everyday
// entries, and its 7/14/30/90 switch would have vanished.
//
// That is worked out from the creation time on every view, never
// written, so opening Money saves nothing to an existing journey (a save there
// would bump its version and could turn a partner's save at that moment into a
// conflict). The line is a moment, not a day: a journey made on the evening of
// the merge day would otherwise keep every card for good, and round 2 could not
// be tried on a new journey until the next morning. Set when the pull request
// was opened; a journey made between then and the merge starts short (it is
// that young).

export type MoneyCard = 'chart' | 'range' | 'where' | 'projection'
export const MONEY_CARDS: readonly MoneyCard[] = ['chart', 'range', 'where', 'projection']

export const UNLOCK = {
  chartDays: 3,
  rangeDays: 14,
  whereFamilies: 3,
  projectionDays: 7,
} as const

export interface Unlocks {
  /** the overview (spent so far and the cap bar), Latest and the ledger */
  first: boolean
  /** the beyond-the-everyday strip in the overview */
  beyond: boolean
  chart: boolean
  range: boolean
  where: boolean
  projection: boolean
  /** what today's data meets on its own, recorded or not */
  met: Record<MoneyCard, boolean>
  /** met and not kept yet: MoneyPage saves these with today's date */
  toRecord: MoneyCard[]
  /** the first day with an everyday entry, for the chart's window before its switch appears */
  firstEveryday: string | null
}

export function moneyUnlocks({ ledger, todayIso, tripStart, pace, recorded, createdAt }: {
  ledger: LedgerEntry[]
  todayIso: string
  tripStart?: string
  pace: Pace
  /** what the journey saved (state.moneyUnlocked) */
  recorded?: Partial<Record<MoneyCard, string>>
  /** the journey's creation time: one from before round 2 has everything */
  createdAt?: string
}): Unlocks {
  const legacy = legacyUnlocked(createdAt)
  const kept = { ...legacy, ...recorded }
  const settled = ledger.filter((e) => e.type === 'expense' && isSettled(e.date, todayIso))
  const everyday = settled.filter(isEverydayRow)
  const days = [...new Set(everyday.map((e) => e.date))].sort()
  const families = new Set(everyday.map((e) => groupOf(e.category))).size
  const chart = days.length >= UNLOCK.chartDays
  const met: Record<MoneyCard, boolean> = {
    chart,
    range: days.length >= UNLOCK.rangeDays,
    where: families >= UNLOCK.whereFamilies,
    projection: chart && pace.perDay !== null && pace.days >= UNLOCK.projectionDays,
  }
  const on = (k: MoneyCard) => met[k] || !!kept[k]
  return {
    first: !!legacy || ledger.length > 0,
    beyond: !!legacy || settled.some((e) => !isEverydayRow(e) && (!tripStart || e.date >= tripStart)),
    chart: on('chart'),
    range: on('range'),
    where: on('where'),
    projection: on('projection'),
    met,
    toRecord: MONEY_CARDS.filter((k) => met[k] && !kept[k]),
    firstEveryday: days[0] ?? null,
  }
}

/** When round 2 shipped; journeys created before it had every card from the start. */
export const ROUND2_SHIPPED = '2026-09-23T09:45:00Z'

export function legacyUnlocked(createdAt: string | undefined): Partial<Record<MoneyCard, string>> | undefined {
  // Parsed, not compared as text: a timestamp can carry any offset.
  if (!createdAt || !(Date.parse(createdAt) < Date.parse(ROUND2_SHIPPED))) return undefined
  const day = createdAt.slice(0, 10)
  return Object.fromEntries(MONEY_CARDS.map((k) => [k, day]))
}

/** The last line of an early page, naming only what is still to come; null once nothing is. */
export function moreLine(u: Unlocks): string | null {
  const parts = [!u.chart && 'a chart after 3 days', !u.projection && 'a projection after a week'].filter(Boolean)
  return parts.length ? `More appears as you log: ${parts.join(', ')}.` : null
}
