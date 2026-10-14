import type { Segment, TripMeta } from './types'
import { stopProgress, tripDay } from './progress.ts'
import { shortDate } from './timeline.ts'

// The line under a root screen's name (the phone's Journey.kicker): "Day 12 ·
// Da Lat, night 3", "Day 12 · between stops", "Leaves 5 Sep", "Home again".
// Trip shows it in small capitals; Money lowercases its first letter after the
// journey's name ("Asia · day 12 · Da Lat, night 3").
export function tripKicker(meta: Pick<TripMeta, 'startDate' | 'endDate'>, segments: Segment[], todayIso: string): string {
  const day = tripDay(meta, todayIso)
  if (!day) return meta.startDate ? `Leaves ${shortDate(meta.startDate)}` : ''
  if (meta.endDate && todayIso > meta.endDate) return 'Home again'
  const current = segments
    .filter((s) => s.include !== false && !!s.arrive && !!s.depart && s.arrive <= todayIso && todayIso < s.depart)
    .sort((a, b) => a.arrive.localeCompare(b.arrive))[0]
  if (!current) return `Day ${day} · between stops`
  const { night } = stopProgress(current, todayIso)
  return `Day ${day} · ${current.city}, night ${night}`
}

/** "Asia · day 12 · Da Lat, night 3": Money's line under its name. */
export const moneyKicker = (name: string, kicker: string) =>
  kicker ? `${name} · ${kicker[0].toLowerCase()}${kicker.slice(1)}` : name
