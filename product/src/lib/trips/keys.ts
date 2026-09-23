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
  // People the signed-in user follows (migration 33). Account-scoped, not
  // trip-scoped: the list is the same whichever of your own trips is active.
  following: ['following'] as const,
  // The sanitized read view of one followed trip (/journeys/[trip]).
  followedSummary: (tripId: string) => ['followed-summary', tripId] as const,
  // Follower-visible events across every followed trip, for the merged Home
  // feed. Fetched separately from tk.events and merged on the client — two
  // authorization models never share one query.
  followingFeed: ['following-feed'] as const,
  // People who follow the signed-in user (migration 34).
  followers: ['followers'] as const,
  // One post, as the follower projection shows it (own posts included).
  post: (eventId: string) => ['post', eventId] as const,
  // The comment thread under a post.
  comments: (eventId: string) => ['comments', eventId] as const,
  // Own reaction / comment count / tally for a set of posts, keyed by the
  // sorted id list so the same feed page hits the same cache entry.
  feedSocial: (eventIds: readonly string[]) => ['feed-social', [...eventIds].sort().join(',')] as const,
  // The signed-in person's notification matrix (migration 37) and their
  // per-trip mutes — account-scoped, like following.
  notifyPrefs: ['notify-prefs'] as const,
  tripNotify: ['trip-notify'] as const,
  // Money's once-per-account answer (profiles.track_spending, migration 41),
  // read as a Tracking state (lib/trips/tracking.ts). Account-scoped: sign-out
  // clears the whole cache, so one key serves whoever is signed in.
  trackSpending: ['track-spending'] as const,
}
