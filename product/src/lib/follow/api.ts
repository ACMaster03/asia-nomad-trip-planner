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
  /** owner paused all sharing — only tripName is populated (migration 16) */
  paused?: boolean
  /**
   * Realtime channel to listen on for "something changed" pings (migration 18).
   * Absent while paused — a paused link is not told its topic either.
   */
  broadcastTopic?: string
}

export type SharedEventKind = 'checkin' | 'note' | 'arrived' | 'media' | 'location'

export interface SharedEvent {
  id: string
  kind: SharedEventKind
  occurred_at: string
  payload: { placeName?: string; text?: string; city?: string; photos?: string[] }
  rating: number | null
  comment: string | null
}

// The bucket is public (migration 12) — the path IS the credential, same
// entropy model as the follow token itself.
export function followMediaUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/trip-media/${path}`
}

// null = unknown/revoked/expired token (the RPC deliberately does not say which).
export async function fetchSharedSummary(
  sb: SupabaseClient,
  token: string,
): Promise<SharedSummary | null> {
  const { data, error } = await sb.rpc('shared_trip_summary', { p_token: token })
  if (error) throw error
  const s = data as SharedSummary | null
  if (!s) return null
  // Paused answers carry only {paused, tripName} — normalize the rest so the
  // client never touches undefined route/dates.
  if (s.paused) return { ...s, startDate: '', endDate: null, route: [] }
  return s
}

// Email digest opt-in (daily/weekly) — handled by the `digest` Edge Function
// (double opt-in via Resend; the anon key is enough, the share token is the
// real credential).
export async function subscribeDigest(
  token: string,
  email: string,
  frequency: 'daily' | 'weekly',
): Promise<'confirm-sent' | 'pending' | 'updated'> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/digest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action: 'subscribe', token, email, frequency }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'subscription failed')
  return body.status
}

export async function fetchSharedFeed(
  sb: SupabaseClient,
  token: string,
): Promise<SharedEvent[] | null> {
  const { data, error } = await sb.rpc('shared_feed', { p_token: token })
  if (error) throw error
  return (data as SharedEvent[] | null) ?? null
}
