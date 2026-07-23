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
}

const SHARE_COLS = 'id, trip_id, token_prefix, label, created_at, expires_at, revoked_at'

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
