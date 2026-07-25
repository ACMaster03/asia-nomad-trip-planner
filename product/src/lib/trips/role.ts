import type { SupabaseClient } from '@supabase/supabase-js'

// WHO YOU ARE ON THIS TRIP.
//
// The database has enforced this split since migration 06 (can_view_trip vs
// can_edit_trip) but the UI never asked: createInvite hardcoded 'editor' and
// nothing read trip_members.role, so a viewer would have seen the full edit UI
// and had every single write bounce off RLS. This module is the client-side
// mirror of those two SQL functions — it must stay in agreement with them.
//
//   owner  — trips.owner = you. Can edit, share, and delete the trip.
//   editor — a trip_members row with role 'editor'. Can edit everything except
//            deleting the trip itself.
//   viewer — a trip_members row with role 'viewer'. Read-only.
//   none   — no relationship (or the trip is gone / hidden by RLS).
//
// SECURITY NOTE: this is presentation only. Hiding a button is not a
// permission check — the boundary is RLS plus the 42501 pre-checks inside
// write_state/ledger_upsert_entry/ledger_delete_entry. Every read-only state
// here has a server-side counterpart that would refuse the write anyway.
export type TripRole = 'owner' | 'editor' | 'viewer' | 'none'

// 'unknown' is NOT a role — it is the client's "haven't resolved it yet"
// state, kept distinct so the UI can withhold BOTH the edit buttons and the
// read-only banner instead of briefly libelling an owner as a viewer.
export type ResolvedRole = TripRole | 'unknown'

export function canEditRole(role: ResolvedRole): boolean {
  return role === 'owner' || role === 'editor'
}

// Owner-only powers. Deliberately NARROW: sharing is NOT one of them —
// create_share_link and set_trip_sharing_paused gate on can_edit_trip
// (migrations 11/16), so co-editors manage follow links too. This is for
// things only `trips.owner` can do, i.e. deleting the trip outright.
export function canAdministerRole(role: ResolvedRole): boolean {
  return role === 'owner'
}

export function roleLabel(role: ResolvedRole): string {
  return role === 'owner' ? 'Owner' : role === 'editor' ? 'Co-editor' : role === 'viewer' ? 'Viewer' : ''
}

// Resolve the caller's role on one trip. Isomorphic: works with the server
// client (cookie session) and the browser client alike.
//
// `uid` is optional so server callers that already have the verified claims can
// skip a round trip; when omitted we ask the client for the user.
//
// Two queries, not one embedded select: the trip_members embed would return
// EVERY member row of the trip and force a client-side filter, and the owner
// case (by far the common one) short-circuits before the second query runs.
export async function fetchTripRole(
  sb: SupabaseClient,
  tripId: string,
  uid?: string | null,
): Promise<TripRole> {
  let userId = uid ?? null
  if (!userId) {
    const { data } = await sb.auth.getUser()
    userId = data.user?.id ?? null
  }
  if (!userId) return 'none'

  // RLS (can_view_trip) already hides trips you have no relationship with, so
  // "not visible" and "no access" are the same answer.
  const { data: trip, error } = await sb.from('trips').select('owner').eq('id', tripId).maybeSingle()
  if (error) throw error
  if (!trip) return 'none'
  if ((trip as { owner: string }).owner === userId) return 'owner'

  const { data: member, error: mErr } = await sb
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle()
  if (mErr) throw mErr

  // Unknown/absent role → 'none'. Never default to an editing role: a row we
  // cannot classify must not hand out write affordances.
  const role = (member as { role?: string } | null)?.role
  return role === 'editor' ? 'editor' : role === 'viewer' ? 'viewer' : 'none'
}
