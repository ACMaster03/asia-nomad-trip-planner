import type { SupabaseClient } from '@supabase/supabase-js'

// The follower page's ONLY data source: the sanitized anon RPCs from
// migration 11. No table access, no auth — the token is the credential.

export interface SharedRouteStop {
  city: string
  country: string
  arrive: string
  depart: string
  lat: number | null
  lng: number | null
}

export interface SharedSummary {
  tripName: string
  startDate: string
  endDate: string | null
  route: SharedRouteStop[]
}

export type SharedEventKind = 'checkin' | 'note' | 'arrived' | 'media' | 'location'

export interface SharedEvent {
  id: string
  kind: SharedEventKind
  occurred_at: string
  payload: { placeName?: string; text?: string; city?: string }
  rating: number | null
  comment: string | null
}

// null = unknown/revoked/expired token (the RPC deliberately does not say which).
export async function fetchSharedSummary(
  sb: SupabaseClient,
  token: string,
): Promise<SharedSummary | null> {
  const { data, error } = await sb.rpc('shared_trip_summary', { p_token: token })
  if (error) throw error
  return (data as SharedSummary | null) ?? null
}

export async function fetchSharedFeed(
  sb: SupabaseClient,
  token: string,
): Promise<SharedEvent[] | null> {
  const { data, error } = await sb.rpc('shared_feed', { p_token: token })
  if (error) throw error
  return (data as SharedEvent[] | null) ?? null
}
