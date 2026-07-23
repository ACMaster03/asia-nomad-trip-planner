import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Lived-trip event rows (migrations 09/10) — the /live feed's query layer.
//
// APPEND-ONLY by design: there is no update path; a wrong entry is deleted
// (the "undo" affordance) and redone, so concurrent writers can't conflict.
// Event ids are CLIENT-GENERATED (crypto.randomUUID()) so the future offline
// outbox can re-insert idempotently after reconnecting — keep every write here
// a single-row insert keyed by that id.
//
// Like queries.ts: every function takes the SupabaseClient as its first arg
// (hard architectural rule — these get extracted to a shared package
// post-departure).
// ============================================================================

export type TripEventKind = 'checkin' | 'note' | 'arrived' | 'media' | 'location'
export type TripEventVisibility = 'trip' | 'followers' | 'public'

// Structured half of a check-in (check_ins row, same id as the event).
export interface CheckInDetails {
  place_id: string | null
  rating: number | null
  comment: string | null
}

export interface TripEvent {
  id: string
  trip_id: string
  author: string
  kind: TripEventKind
  payload: Record<string, unknown> // checkin: {placeName} · note: {text} · arrived: {city}
  visibility: TripEventVisibility
  occurred_at: string
  created_at: string
  check_in: CheckInDetails | null // null for every kind but 'checkin'
}

const EVENT_COLS =
  'id,trip_id,author,kind,payload,visibility,occurred_at,created_at,check_ins(place_id,rating,comment)'

type RawEvent = Omit<TripEvent, 'check_in'> & {
  check_ins: CheckInDetails | CheckInDetails[] | null
}

// Newest-first feed for one trip. PostgREST embeds check_ins as a single object
// (its pk IS the fk → one-to-one), but normalize the array shape defensively.
export async function fetchTripEvents(
  sb: SupabaseClient,
  tripId: string,
  limit = 50,
): Promise<TripEvent[]> {
  const { data, error } = await sb
    .from('trip_events')
    .select(EVENT_COLS)
    .eq('trip_id', tripId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as RawEvent[]).map(({ check_ins, ...e }) => ({
    ...e,
    check_in: Array.isArray(check_ins) ? (check_ins[0] ?? null) : (check_ins ?? null),
  }))
}

// Plain event insert ('note' / 'arrived' / …). RLS requires author=auth.uid().
export async function insertTripEvent(
  sb: SupabaseClient,
  input: {
    id: string
    tripId: string
    kind: TripEventKind
    payload?: Record<string, unknown>
    visibility?: TripEventVisibility
  },
): Promise<void> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  const { error } = await sb.from('trip_events').insert({
    id: input.id,
    trip_id: input.tripId,
    author: uid,
    kind: input.kind,
    payload: input.payload ?? {},
    visibility: input.visibility ?? 'trip', // default is Trip only — sharing is opt-in
  })
  if (error) throw error
}

// Check-in = trip_events row + check_ins row sharing the SAME client-generated
// id (two single-row inserts — outbox-friendly). If the second insert fails,
// the first is best-effort rolled back so no rating-less half check-in lingers.
export async function insertCheckIn(
  sb: SupabaseClient,
  input: {
    id: string
    tripId: string
    placeId: string | null
    placeName: string
    rating?: number | null
    comment?: string | null
    visibility?: TripEventVisibility
  },
): Promise<void> {
  await insertTripEvent(sb, {
    id: input.id,
    tripId: input.tripId,
    kind: 'checkin',
    payload: { placeName: input.placeName },
    visibility: input.visibility,
  })
  const { error } = await sb.from('check_ins').insert({
    event_id: input.id,
    trip_id: input.tripId,
    place_id: input.placeId,
    rating: input.rating ?? null,
    comment: input.comment?.trim() || null,
  })
  if (error) {
    await sb.from('trip_events').delete().eq('id', input.id) // best-effort undo
    throw error
  }
}

// Undo: authors delete their own events (RLS-enforced); check_ins cascades.
export async function deleteTripEvent(sb: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await sb.from('trip_events').delete().eq('id', eventId)
  if (error) throw error
}
