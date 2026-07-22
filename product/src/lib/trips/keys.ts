export const tk = {
  // One cache entry per trip document. All screens are scoped to the selected
  // trip id supplied by TripScope (per-account, profiles.active_trip_id).
  trip: (id: string) => ['trip', id] as const,
  // The lightweight trip list for the Settings switcher.
  trips: ['trips'] as const,
}
