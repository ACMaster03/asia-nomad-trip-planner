import type { SupabaseClient } from '@supabase/supabase-js'

// Follow-link management (M3, migration 11). Tokens are hashed at rest: the
// raw link exists ONLY in createShareLink's return value — copy it then or
// mint a new one. token_prefix is display sugar for the Settings list.

export interface TripShare {
  id: string
  trip_id: string
  token_prefix: string | null
  label: string | null
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  paused_at: string | null
}

const SHARE_COLS = 'id, trip_id, token_prefix, label, created_at, expires_at, revoked_at, paused_at'

export async function fetchShares(sb: SupabaseClient, tripId: string): Promise<TripShare[]> {
  const { data, error } = await sb
    .from('trip_shares')
    .select(SHARE_COLS)
    .eq('trip_id', tripId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createShareLink(
  sb: SupabaseClient,
  tripId: string,
  label: string,
  expiresAt: string | null,
): Promise<string> {
  const { data, error } = await sb.rpc('create_share_link', {
    p_trip: tripId,
    p_label: label || null,
    p_expires: expiresAt,
  })
  if (error) throw error
  return data as string
}

export async function revokeShare(sb: SupabaseClient, shareId: string): Promise<void> {
  const { error } = await sb
    .from('trip_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId)
  if (error) throw error
}

// ---- M3 polish (migration 16): follower counts + pause-all ----

export interface ShareStats {
  share_id: string
  push: number
  email: number
}

export async function fetchShareStats(sb: SupabaseClient, tripId: string): Promise<ShareStats[]> {
  const { data, error } = await sb.rpc('share_follower_stats', { p_trip: tripId })
  if (error) throw error
  return (data ?? []) as ShareStats[]
}

// Pauses/resumes EVERY live link of the trip: followers get the "sharing
// paused" page, push + digests are muted; opt-ins survive and un-mute on
// resume.
export async function setTripSharingPaused(
  sb: SupabaseClient,
  tripId: string,
  paused: boolean,
): Promise<void> {
  const { error } = await sb.rpc('set_trip_sharing_paused', { p_trip: tripId, p_paused: paused })
  if (error) throw error
}

// Pauses/resumes ONE link — paused_at on its own row, so "mute grandma's link
// while the family one keeps flowing" is expressible. Plain table update (no
// RPC); RLS decides whether the caller may, and the UI surfaces a refusal.
export async function setShareLinkPaused(
  sb: SupabaseClient,
  linkId: string,
  paused: boolean,
): Promise<void> {
  const { error } = await sb
    .from('trip_shares')
    .update({ paused_at: paused ? new Date().toISOString() : null })
    .eq('id', linkId)
  if (error) throw error
}
