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
}
