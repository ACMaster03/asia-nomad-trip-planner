export const tk = {
  // One cache entry per trip document. All screens are scoped to the selected
  // trip id supplied by TripScope (per-account, profiles.active_trip_id).
  trip: (id: string) => ['trip', id] as const,
  // The lightweight trip list for the Settings switcher.
  trips: ['trips'] as const,
  // The lived-trip event feed (/live): trip_events + embedded check_ins,
  // newest first. Append-only rows — mutations optimistically prepend/remove
  // and invalidate this key.
  events: (tripId: string) => ['trip-events', tripId] as const,
  // Active follow links for the Settings sharing panel (migration 11).
  shares: (tripId: string) => ['trip-shares', tripId] as const,
  // The caller's role on a trip (owner/editor/viewer/none). Separate key from
  // the trip document so revalidating access doesn't refetch the whole state
  // blob — and so a revoked co-editor's role can go stale on its own schedule.
  role: (tripId: string) => ['trip-role', tripId] as const,
  // Invites addressed to the signed-in user, across ALL trips — deliberately
  // not trip-scoped: you are invited to trips you cannot see yet.
  pendingInvites: ['pending-invites'] as const,
  // Invites this trip has sent that nobody has answered (the inviter's list).
  sentInvites: (tripId: string) => ['sent-invites', tripId] as const,
}
