import type { SupabaseClient } from '@supabase/supabase-js'
import type { FollowedEvent } from './follows'

// Reactions, comments, followers and blocks (migration 34). Every read here
// goes through a SECURITY DEFINER RPC that decides visibility server-side:
// travellers see everything on their trip, a follower sees follower-visible
// posts by the people they follow (and arrivals), anonymous link holders see
// what the link shows. The client never reads the tables directly.

// ---- reactions ----------------------------------------------------------------

/** Stored keys; glyphs come from the registry (fetchReactionKinds) or this mirror. */
export type ReactionKind = 'heart' | 'laugh' | 'wow' | 'clap' | 'fire' | 'care'

export interface ReactionKindRow {
  key: ReactionKind | string
  glyph: string
  label: string
  sort: number
}

/** Mirror of public.reaction_kinds, for rendering before the registry loads. */
export const REACTION_KINDS: ReactionKindRow[] = [
  { key: 'heart', glyph: '❤️', label: 'beautiful', sort: 1 },
  { key: 'laugh', glyph: '😂', label: 'funny', sort: 2 },
  { key: 'wow', glyph: '😮', label: 'astonishing', sort: 3 },
  { key: 'clap', glyph: '👏', label: 'milestone', sort: 4 },
  { key: 'fire', glyph: '🔥', label: 'the grind', sort: 5 },
  { key: 'care', glyph: '🥹', label: 'affection', sort: 6 },
]

export async function fetchReactionKinds(sb: SupabaseClient): Promise<ReactionKindRow[]> {
  const { data, error } = await sb.from('reaction_kinds').select('key, glyph, label, sort').order('sort')
  if (error) throw error
  return (data ?? []) as ReactionKindRow[]
}

export interface TallyEntry {
  kind: string
  count: number
}

/** What feed_social returns per post. `tally` is present only for travellers on that trip. */
export interface PostSocial {
  event_id: string
  /** the caller's own reaction, absent when none */
  mine?: string
  commentCount: number
  tally?: TallyEntry[]
}

/** Own reaction, comment count and (for travellers) the tally, for up to 100 posts. */
export async function fetchFeedSocial(sb: SupabaseClient, eventIds: string[]): Promise<PostSocial[]> {
  if (eventIds.length === 0) return []
  const { data, error } = await sb.rpc('feed_social', { p_events: eventIds.slice(0, 100) })
  if (error) throw error
  return ((data as PostSocial[] | null) ?? []) as PostSocial[]
}

/** Set the caller's reaction, or clear it with null. Returns the post's fresh social row. */
export async function react(
  sb: SupabaseClient,
  eventId: string,
  kind: ReactionKind | string | null,
): Promise<PostSocial> {
  const { data, error } = await sb.rpc('react', { p_event: eventId, p_kind: kind })
  if (error) throw error
  return data as PostSocial
}

export interface Reactor {
  user_id: string
  name: string
  kind: string
}

/** Who reacted with what. Travellers on the trip only; others get an empty list. */
export async function fetchReactors(sb: SupabaseClient, eventId: string): Promise<Reactor[]> {
  const { data, error } = await sb.rpc('event_reactors', { p_event: eventId })
  if (error) throw error
  return ((data as Reactor[] | null) ?? []) as Reactor[]
}

/** Comment counts for the anonymous follow page. */
export async function fetchSharedFeedSocial(
  sb: SupabaseClient,
  token: string,
  eventIds: string[],
): Promise<Pick<PostSocial, 'event_id' | 'commentCount'>[]> {
  if (eventIds.length === 0) return []
  const { data, error } = await sb.rpc('shared_feed_social', { p_token: token, p_events: eventIds.slice(0, 100) })
  if (error) throw error
  return ((data as PostSocial[] | null) ?? []) as PostSocial[]
}

// ---- comments -----------------------------------------------------------------

export interface PostComment {
  id: string
  parent_id: string | null
  /** null on a deleted placeholder */
  author: string | null
  authorName: string | null
  isTraveller: boolean
  /** '' on a deleted placeholder */
  body: string
  deleted: boolean
  created_at: string
}

/** The thread, flat and ordered: each top-level comment followed by its replies. null = not visible to the caller. */
export async function fetchComments(sb: SupabaseClient, eventId: string): Promise<PostComment[] | null> {
  const { data, error } = await sb.rpc('event_comments_list', { p_event: eventId })
  if (error) throw error
  return (data as PostComment[] | null) ?? null
}

/** Same thread for an anonymous link holder. */
export async function fetchSharedComments(
  sb: SupabaseClient,
  token: string,
  eventId: string,
): Promise<PostComment[] | null> {
  const { data, error } = await sb.rpc('shared_event_comments', { p_token: token, p_event: eventId })
  if (error) throw error
  return (data as PostComment[] | null) ?? null
}

/** Write a comment, or a reply to a top-level comment (one level only). */
export async function addComment(
  sb: SupabaseClient,
  eventId: string,
  body: string,
  parentId: string | null = null,
): Promise<PostComment> {
  const { data, error } = await sb.rpc('add_comment', { p_event: eventId, p_body: body, p_parent: parentId })
  if (error) throw error
  return data as PostComment
}

/** Your own comment, or any comment on a trip you edit. Soft: the row stays as a placeholder if replies hang off it. */
export async function deleteComment(sb: SupabaseClient, commentId: string): Promise<void> {
  const { error } = await sb.rpc('delete_comment', { p_comment: commentId })
  if (error) throw error
}

export async function reportComment(sb: SupabaseClient, commentId: string, reason: string): Promise<void> {
  const { error } = await sb.rpc('report_comment', { p_comment: commentId, p_reason: reason })
  if (error) throw error
}

// ---- followers and blocks -----------------------------------------------------

export interface FollowerLocation {
  trip_id: string
  tripName: string
  city: string | null
  country: string | null
}

export interface Follower {
  user_id: string
  name: string
  followedAt: string
  /** where they are, only if they opened that trip to followers; otherwise null */
  location: FollowerLocation | null
}

/** Everyone who follows the caller, alphabetical. */
export async function fetchMyFollowers(sb: SupabaseClient): Promise<Follower[]> {
  const { data, error } = await sb.rpc('my_followers')
  if (error) throw error
  return ((data as Follower[] | null) ?? []) as Follower[]
}

/** "Remove": they stop following you. Plain delete; RLS lets the followee do it. */
export async function removeFollower(sb: SupabaseClient, userId: string): Promise<void> {
  const { error } = await sb.from('user_follows').delete().eq('follower_id', userId)
  if (error) throw error
}

/** Block: ends the follow and shuts every link for that person (and their email). */
export async function blockUser(sb: SupabaseClient, userId: string): Promise<void> {
  const { error } = await sb.rpc('block_user', { p_user: userId })
  if (error) throw error
}

export async function unblockUser(sb: SupabaseClient, userId: string): Promise<void> {
  const { error } = await sb.rpc('unblock_user', { p_user: userId })
  if (error) throw error
}

export interface BlockedPerson {
  user_id: string
  name: string
  blockedAt: string
}

export async function fetchMyBlocked(sb: SupabaseClient): Promise<BlockedPerson[]> {
  const { data, error } = await sb.rpc('my_blocked')
  if (error) throw error
  return ((data as BlockedPerson[] | null) ?? []) as BlockedPerson[]
}

// ---- one post (migration 35) --------------------------------------------------

/**
 * A single post as the follower projection shows it, for the post page. Works
 * for travellers on their own posts too. null = not visible to the caller.
 */
export async function fetchFollowedEvent(sb: SupabaseClient, eventId: string): Promise<FollowedEvent | null> {
  const { data, error } = await sb.rpc('followed_event', { p_event: eventId })
  if (error) throw error
  return (data as FollowedEvent | null) ?? null
}

/** The same, for an anonymous link holder. */
export async function fetchSharedEvent(sb: SupabaseClient, token: string, eventId: string): Promise<FollowedEvent | null> {
  const { data, error } = await sb.rpc('shared_event', { p_token: token, p_event: eventId })
  if (error) throw error
  return (data as FollowedEvent | null) ?? null
}
