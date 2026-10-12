import type { FollowedEvent, FollowedPerson, FollowedSummary, FollowedTripCard } from './follows.ts'
import type { SharedEvent, SharedRouteStop } from './api.ts'
import { normCity } from '../map/norm.ts'
import { nightsBetween } from '../trips/format.ts'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "14 Aug", from a plain ISO date (reminders.ts shortDate, kept here so the test runner can load this file). */
export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

// Home's "Journeys you follow" and "Latest", by the phone's rules
// (ios/Livhold/Follow/FollowingHome.swift, FollowModel.swift, FollowStore.swift).
// Pure, so the rules are testable (home.test.ts).

/** Live ones first, then those still to come, then the finished ones, paused last. */
export function rank(c: FollowedTripCard, today: string): 0 | 1 | 2 | 3 {
  if (c.state === 'paused') return 3
  const start = c.startDate ?? ''
  const end = c.endDate ?? ''
  if (start && start <= today && (!end || today <= end)) return 0
  if (start > today) return 1
  return 2
}

export const isLive = (c: FollowedTripCard, today: string) => rank(c, today) === 0

/**
 * One card per journey, however many of its travellers you follow
 * (my_following lists a trip under each person), live first, newest first.
 */
export function journeyCards(people: readonly FollowedPerson[], today: string): FollowedTripCard[] {
  const byTrip = new Map<string, FollowedTripCard>()
  for (const p of people) for (const t of p.trips) if (!byTrip.has(t.trip_id)) byTrip.set(t.trip_id, t)
  return [...byTrip.values()].sort((a, b) => {
    const ra = rank(a, today)
    const rb = rank(b, today)
    if (ra !== rb) return ra - rb
    return (b.startDate ?? '').localeCompare(a.startDate ?? '')
  })
}

/** Whether any followed journey is under way today. */
export const anyLive = (people: readonly FollowedPerson[], today: string) =>
  journeyCards(people, today).some((c) => isLive(c, today))

/** "Patrik and Petra", "Patrik, Petra and Anna". */
export function names(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

const sameCity = (a: string, b: string) => !!normCity(a) && normCity(a) === normCity(b)

/** The local calendar day of an instant, "2026-10-12". */
export function dayOf(iso: string, local = true): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  if (!local) return d.toISOString().slice(0, 10)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

type AnyEvent = Pick<SharedEvent, 'kind' | 'occurred_at' | 'payload'>

/**
 * Which stop a post belongs to. An arrival names its city. A check-in goes by
 * its day; on a travel day, one posted before that day's arrival is the stop
 * before.
 */
export function stopIndexOf(route: readonly SharedRouteStop[], events: readonly AnyEvent[], e: AnyEvent): number | null {
  if (e.kind === 'arrived') {
    const city = e.payload.city ?? ''
    const i = lastIndex(route, (r) => sameCity(r.city, city))
    return i >= 0 ? i : null
  }
  const day = dayOf(e.occurred_at)
  let i = lastIndex(route, (r) => !!r.arrive && r.arrive <= day && (day < r.depart || !r.depart))
  if (i < 0) i = lastIndex(route, (r) => !!r.arrive && r.arrive <= day)
  if (i < 0) return route.length ? 0 : null
  if (i > 0 && route[i].arrive === day) {
    const arrived = events.find((a) => a.kind === 'arrived' && sameCity(a.payload.city ?? '', route[i].city))
    if (arrived && dayOf(arrived.occurred_at) === day && e.occurred_at < arrived.occurred_at) i -= 1
  }
  return i
}

function lastIndex<T>(list: readonly T[], test: (x: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return i
  return -1
}

/** The leg into stop `i` as the travellers typed it, if any. */
export function legInto(summary: Pick<FollowedSummary, 'route' | 'legs'>, i: number) {
  if (i <= 0 || i >= summary.route.length) return null
  const a = summary.route[i - 1].city
  const b = summary.route[i].city
  return (summary.legs ?? []).find((l) => sameCity(l.from, a) && sameCity(l.to, b)) ?? null
}

/** "by train"; null for other. */
export function byMode(mode?: string | null): string | null {
  switch (mode) {
    case 'flight': return 'by plane'
    case 'train': return 'by train'
    case 'bus': return 'by bus'
    case 'ferry': return 'by ferry'
    default: return null
  }
}

/** "By train from Hanoi". */
export function fromLabel(city: string, mode?: string | null): string {
  const by = byMode(mode)
  return by ? `${by[0].toUpperCase()}${by.slice(1)} from ${city}` : `From ${city}`
}

/**
 * The journey card's line: "Hanoi, day 41 · next Da Nang, 13 Nov",
 * "Day 3 · between stops", "Leaves 5 Sep", "Home again". Without the
 * summary, the card's current city; null when sharing is paused.
 */
export function journeyLine(
  card: FollowedTripCard,
  summary: FollowedSummary | null | undefined,
  events: readonly FollowedEvent[],
  today: string,
): string | null {
  if (card.state === 'paused') return null
  const start = summary?.startDate || card.startDate || ''
  const end = summary?.endDate ?? card.endDate ?? ''
  if (start && today < start) return `Leaves ${shortDate(start)}`
  if (end && today > end) return 'Home again'
  if (!summary || summary.paused) return card.currentCity
  const route = summary.route
  const day = start ? nightsBetween(start, today) + 1 : null
  const curIndex = route.findIndex((r) => r.arrive <= today && today < r.depart)
  const cur = curIndex >= 0 ? route[curIndex] : null
  const next = route.find((r) => r.arrive > today) ?? null
  const parts: string[] = []
  if (cur && day) parts.push(`${cur.city}, day ${day}`)
  else if (day) parts.push(`Day ${day} · between stops`)
  const own = events.filter((e) => e.trip_id === card.trip_id)
  const arrivedToday =
    cur && cur.arrive === today
      ? own.find((e) => e.kind === 'arrived' && stopIndexOf(route, own, e) === curIndex && dayOf(e.occurred_at) === today)
      : null
  if (arrivedToday) {
    const how = byMode(legInto(summary, curIndex)?.mode)
    parts.push(how ? `arrived today ${how}` : 'arrived today')
  } else if (next) {
    parts.push(`next ${next.city}, ${shortDate(next.arrive)}`)
  }
  return parts.join(' · ')
}

/** "just now", "2 hours ago", "yesterday", "9 Oct" (the phone's FollowDates.when). */
export function whenLabel(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const secs = (now - t) / 1000
  if (secs < 90) return 'just now'
  if (secs < 20 * 3600) {
    const mins = Math.round(secs / 60)
    if (mins < 60) return mins === 1 ? '1 minute ago' : `${mins} minutes ago`
    const hours = Math.round(secs / 3600)
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  if (dayOf(iso) === dayOf(d.toISOString())) return 'yesterday'
  return shortDate(dayOf(iso))
}

/** "Rainy and perfect." from "Rainy and perfect. The train came through at seven." */
export function firstSentence(s?: string | null): string | null {
  const t = s?.trim() ?? ''
  if (!t) return null
  const cut = t.indexOf('. ')
  if (cut >= 0) return t.slice(0, cut) + '.'
  return t.length > 60 ? t.slice(0, 57) + '…' : t
}
