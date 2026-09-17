import type { TripEvent } from '../trips/events'
import type { FollowedEvent } from './follows.ts'

// The merged Home feed (docs/SOCIAL-SCOPE.md §3, decision 12). Own events and
// followed events are fetched by two different RPC paths — full payloads with
// private 'trip' notes on one side, the sanitized follower projection on the
// other — and are only ever combined HERE, on the client, as a time-sorted
// list. One SQL projection across two authorization models is how a private
// note ends up in a follower's feed; keeping the merge in TypeScript makes
// that mistake impossible to write in SQL.

export type HomeFeedItem =
  | { source: 'own'; occurred_at: string; event: TripEvent }
  | { source: 'followed'; occurred_at: string; event: FollowedEvent; label: string; trip: string }

/**
 * Newest first. Ties (same timestamp) keep own events before followed ones,
 * then fall back to id so the order is stable across refetches.
 */
export function mergeFeeds(
  own: readonly TripEvent[],
  followed: readonly FollowedEvent[],
  limit = Number.POSITIVE_INFINITY,
): HomeFeedItem[] {
  const items: HomeFeedItem[] = [
    ...own.map((event) => ({ source: 'own' as const, occurred_at: event.occurred_at, event })),
    ...followed.map((event) => ({
      source: 'followed' as const,
      occurred_at: event.occurred_at,
      event,
      label: event.authorName,
      trip: event.tripName,
    })),
  ]
  items.sort((a, b) => {
    if (a.occurred_at !== b.occurred_at) return a.occurred_at < b.occurred_at ? 1 : -1
    if (a.source !== b.source) return a.source === 'own' ? -1 : 1
    return a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0
  })
  return Number.isFinite(limit) ? items.slice(0, Math.max(0, limit)) : items
}
