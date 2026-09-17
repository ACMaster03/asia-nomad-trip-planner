import type { SupabaseClient } from '@supabase/supabase-js'
import type { SharedEvent, SharedRouteStop, Traveller } from './api'

// Following people (migration 33, Phase A of docs/SOCIAL-SCOPE.md). The
// signed-in twin of ./api.ts: same sanitized projection, but the relationship
// is person → person (user_follows) and lives on the account instead of in a
// token. The unit of content stays the trip: a followed person's trip shows
// up only while its travellers keep it open to followers, and the feed carries
// the posts of the people you actually follow (plus the trip's arrivals).

/** What a trip's travellers have set for their followers. */
export type FollowerAccess = 'off' | 'on' | 'paused'

/** One trip as it appears under a followed person in the people list. */
export interface FollowedTripCard {
  trip_id: string
  tripName: string
  startDate: string | null
  endDate: string | null
  /** never 'off' here — off trips are not listed at all */
  state: Exclude<FollowerAccess, 'off'>
  travellers: Traveller[]
  /** null unless state === 'on' — a paused trip goes dark in the list too */
  currentCity: string | null
  /** the current stop's country (migration 34), for the "who is in Japan" filter */
  currentCountry: string | null
  lastEventAt: string | null
  lastSeenCity: string | null
}

export interface FollowedPerson {
  user_id: string
  name: string
  followedAt: string
  /** trips open to followers that this person travels on, newest first */
  trips: FollowedTripCard[]
}

export interface FollowedSummary {
  tripName: string
  startDate: string
  endDate: string | null
  route: SharedRouteStop[]
  travellers: Traveller[]
  /** ids of the travellers whose posts the caller will see */
  following: string[]
  /** every traveller paused the trip — only tripName populated */
  paused?: boolean
  /** one live link's realtime topic; absent when the trip has no link (poll) */
  broadcastTopic?: string
}

/** A follower-visible event plus which trip it belongs to. */
export interface FollowedEvent extends SharedEvent {
  trip_id: string
  tripName: string
}

export interface FollowResult {
  trip_id: string
  tripName: string
  /** who the caller now follows as a result of this call */
  followed: Traveller[]
}

// ---- the door ---------------------------------------------------------------

/**
 * Follow the travellers behind a share link. The ONLY call on the account
 * path that ever sends a raw token. `travellers` null = everyone on the trip
 * (the preselected default); otherwise only those ids. null back = dead,
 * expired or paused link, or nobody left to follow (everyone chosen has
 * blocked the caller) — one answer for all of it on purpose.
 */
export async function followByToken(
  sb: SupabaseClient,
  token: string,
  travellers: string[] | null,
): Promise<FollowResult | null> {
  const { data, error } = await sb.rpc('follow_by_token', {
    p_token: token,
    p_travellers: travellers,
  })
  if (error) throw error
  return (data as FollowResult | null) ?? null
}

// ---- the people list --------------------------------------------------------

/** Everyone the caller follows, with their visible trips, in one round trip. */
export async function fetchMyFollowing(sb: SupabaseClient): Promise<FollowedPerson[]> {
  const { data, error } = await sb.rpc('my_following')
  if (error) throw error
  return ((data as FollowedPerson[] | null) ?? []) as FollowedPerson[]
}

/** Stop following a person. Plain table delete on the caller's own row. */
export async function unfollow(sb: SupabaseClient, userId: string): Promise<void> {
  const { error } = await sb.from('user_follows').delete().eq('followee_id', userId)
  if (error) throw error
}

// ---- the journey page ---------------------------------------------------------

// null = the caller follows nobody on this trip (or is blocked by them all).
export async function fetchFollowedSummary(
  sb: SupabaseClient,
  tripId: string,
): Promise<FollowedSummary | null> {
  const { data, error } = await sb.rpc('followed_trip_summary', { p_trip: tripId })
  if (error) throw error
  const s = data as FollowedSummary | null
  if (!s) return null
  // A paused answer carries only the name — normalize so the page never
  // touches an undefined route, same as fetchSharedSummary.
  if (s.paused) return { ...s, startDate: '', endDate: null, route: [], travellers: [], following: [] }
  return s
}

/** Follower-visible events across every open trip of the people you follow. */
export async function fetchFollowingFeed(
  sb: SupabaseClient,
  opts: { limit?: number; before?: string | null } = {},
): Promise<FollowedEvent[]> {
  const { data, error } = await sb.rpc('following_feed', {
    p_limit: opts.limit ?? 30,
    p_before: opts.before ?? null,
  })
  if (error) throw error
  return ((data as FollowedEvent[] | null) ?? []) as FollowedEvent[]
}

// ---- the traveller's side -----------------------------------------------------

/** The current follower_access of one of the caller's own trips (RLS lets members read it). */
export async function fetchFollowerAccess(sb: SupabaseClient, tripId: string): Promise<FollowerAccess> {
  const { data, error } = await sb.from('trips').select('follower_access').eq('id', tripId).maybeSingle()
  if (error) throw error
  return ((data as { follower_access?: FollowerAccess } | null)?.follower_access ?? 'off') as FollowerAccess
}

/** The per-trip switch: is this trip open to the travellers' followers? */
export async function setFollowerAccess(
  sb: SupabaseClient,
  tripId: string,
  access: FollowerAccess,
): Promise<void> {
  const { error } = await sb.rpc('set_follower_access', { p_trip: tripId, p_access: access })
  if (error) throw error
}

/** How many signed-in accounts follow the caller. */
export async function fetchMyFollowerCount(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb.rpc('my_follower_count')
  if (error) throw error
  return (data as number | null) ?? 0
}
