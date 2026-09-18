import type { TripEvent } from '@/lib/trips/events'
import type { SharedEvent, SharedSummary } from '@/lib/follow/api'
import type { FollowedEvent, FollowedPerson, FollowedSummary } from '@/lib/follow/follows'
import type { Follower, PostComment, PostSocial } from '@/lib/follow/social'
import type { TripListItem } from '@/lib/trips/queries'
import type { ShareStats, TripShare } from '@/lib/trips/shares'
import { DEFAULT_NOTIFY_PREFS, type NotifyPrefs, type TripNotify } from '@/lib/trips/userPush'

// Dev-only fixtures for the social screens: the people you follow, their
// posts, your own trip's rows, one post with a thread, and what an anonymous
// link shows. Names and places are made up; the shapes are the RPCs'.

const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

export const ME = 'me-uuid'
export const ANNA = 'anna-uuid'
export const TOM = 'tom-uuid'
export const MARI = 'mari-uuid'
export const JOURNEY_TRIP = 'jtrip'
export const POST_ID = 'anna-wat-pho'
export const TOKEN = 'fixture-token'

export const following: FollowedPerson[] = [
  {
    user_id: ANNA, name: 'Anna', followedAt: ago(400),
    trips: [{
      trip_id: JOURNEY_TRIP, tripName: 'Japan in autumn', startDate: '2026-09-05', endDate: '2026-10-20', state: 'on',
      travellers: [{ id: ANNA, name: 'Anna' }, { id: TOM, name: 'Tom' }],
      currentCity: 'Kyoto', currentCountry: 'Japan', lastEventAt: ago(3), lastSeenCity: 'Kyoto',
    }],
  },
  {
    user_id: TOM, name: 'Tom', followedAt: ago(400),
    trips: [{
      trip_id: JOURNEY_TRIP, tripName: 'Japan in autumn', startDate: '2026-09-05', endDate: '2026-10-20', state: 'on',
      travellers: [{ id: ANNA, name: 'Anna' }, { id: TOM, name: 'Tom' }],
      currentCity: 'Kyoto', currentCountry: 'Japan', lastEventAt: ago(3), lastSeenCity: 'Kyoto',
    }],
  },
  {
    user_id: MARI, name: 'Mari', followedAt: ago(900),
    trips: [{
      trip_id: 'mtrip', tripName: 'Lisbon weeks', startDate: '2026-09-10', endDate: null, state: 'on',
      travellers: [{ id: MARI, name: 'Mari' }],
      currentCity: 'Lisbon', currentCountry: 'Portugal', lastEventAt: ago(30), lastSeenCity: 'Lisbon',
    }],
  },
  { user_id: 'dani-uuid', name: 'Dani', followedAt: ago(2000), trips: [] },
  {
    user_id: 'eva-uuid', name: 'Eva', followedAt: ago(100),
    trips: [{
      trip_id: 'etrip', tripName: 'Hokkaido', startDate: '2026-09-01', endDate: '2026-09-30', state: 'paused',
      travellers: [{ id: 'eva-uuid', name: 'Eva' }], currentCity: null, currentCountry: null, lastEventAt: null, lastSeenCity: null,
    }],
  },
]

export const followers: Follower[] = [
  { user_id: ANNA, name: 'Anna', followedAt: ago(300), location: { trip_id: JOURNEY_TRIP, tripName: 'Japan in autumn', city: 'Kyoto', country: 'Japan' } },
  { user_id: 'mum-uuid', name: 'Zsuzsa', followedAt: ago(700), location: null },
  { user_id: 'ben-uuid', name: 'Ben', followedAt: ago(50), location: null },
  { user_id: MARI, name: 'Mari', followedAt: ago(800), location: { trip_id: 'mtrip', tripName: 'Lisbon weeks', city: 'Lisbon', country: 'Portugal' } },
]

const japan = { trip_id: JOURNEY_TRIP, tripName: 'Japan in autumn' }
export const followingFeed: FollowedEvent[] = [
  { id: POST_ID, kind: 'checkin', occurred_at: ago(3), author: ANNA, authorName: 'Anna', payload: { placeName: 'Fushimi Inari at dawn', photos: [] }, rating: 5, comment: 'Up at 5, had the gates almost to ourselves. Worth every yawn.', ...japan },
  { id: 'tom-ramen', kind: 'checkin', occurred_at: ago(9), author: TOM, authorName: 'Tom', payload: { placeName: 'Ramen Sen no Kaze', photos: [] }, rating: 4, comment: 'Forty minutes in line, zero regrets.', ...japan },
  { id: 'mari-tram', kind: 'note', occurred_at: ago(30), author: MARI, authorName: 'Mari', payload: { text: 'Tram 28 at 7am is the only way to do it.' }, rating: null, comment: null, trip_id: 'mtrip', tripName: 'Lisbon weeks' },
  { id: 'anna-arrive', kind: 'arrived', occurred_at: ago(50), author: ANNA, authorName: 'Anna', payload: { city: 'Kyoto' }, rating: null, comment: null, ...japan },
  { id: 'tom-osaka', kind: 'checkin', occurred_at: ago(80), author: TOM, authorName: 'Tom', payload: { placeName: 'Dotonbori', photos: [] }, rating: 3, comment: 'Loud. Fun. Loud.', ...japan },
]

export const ownEvents: TripEvent[] = [
  { id: 'own-1', trip_id: 'fixture', author: ME, kind: 'checkin', payload: { placeName: 'Wat Pho, Bangkok' }, visibility: 'followers', occurred_at: ago(5), created_at: ago(5), check_in: { place_id: null, rating: 5, comment: 'Reclining Buddha, then the massage school next door.' } },
  { id: 'own-2', trip_id: 'fixture', author: 'partner-uuid', kind: 'checkin', payload: { placeName: 'Chatuchak market' }, visibility: 'followers', occurred_at: ago(27), created_at: ago(27), check_in: { place_id: null, rating: 4, comment: null } },
  { id: 'own-3', trip_id: 'fixture', author: ME, kind: 'arrived', payload: { city: 'Bangkok' }, visibility: 'followers', occurred_at: ago(120), created_at: ago(120), check_in: null },
]

export const feedSocial: PostSocial[] = [
  { event_id: POST_ID, mine: 'heart', commentCount: 3 },
  { event_id: 'tom-ramen', commentCount: 1 },
  { event_id: 'anna-arrive', mine: 'clap', commentCount: 0 },
  { event_id: 'own-1', commentCount: 2, tally: [{ kind: 'heart', count: 4 }, { kind: 'wow', count: 1 }] },
  { event_id: 'own-2', commentCount: 0, tally: [{ kind: 'laugh', count: 2 }] },
  { event_id: 'own-3', commentCount: 0, tally: [] },
]

export const journeySummary: FollowedSummary = {
  tripName: 'Japan in autumn',
  startDate: '2026-09-05',
  endDate: '2026-10-20',
  route: [
    { city: 'Tokyo', country: 'Japan', arrive: '2026-09-05', depart: '2026-09-14', lat: 35.68, lng: 139.69 },
    { city: 'Kyoto', country: 'Japan', arrive: '2026-09-14', depart: '2026-09-28', lat: 35.01, lng: 135.77 },
    { city: 'Hiroshima', country: 'Japan', arrive: '2026-09-28', depart: '2026-10-08', lat: 34.39, lng: 132.46 },
    { city: 'Osaka', country: 'Japan', arrive: '2026-10-08', depart: '2026-10-20', lat: 34.69, lng: 135.5 },
  ],
  travellers: [{ id: ANNA, name: 'Anna' }, { id: TOM, name: 'Tom' }],
  following: [ANNA, TOM],
}

export const comments: PostComment[] = [
  { id: 'c1', parent_id: null, author: 'mum-uuid', authorName: 'Zsuzsa', isTraveller: false, body: 'Beautiful!! Did you go up to the top?', deleted: false, created_at: ago(2.5) },
  { id: 'c2', parent_id: 'c1', author: ANNA, authorName: 'Anna', isTraveller: true, body: 'Halfway — the crowds catch up around 8.', deleted: false, created_at: ago(2) },
  { id: 'c3', parent_id: null, author: ME, authorName: 'Patrik', isTraveller: false, body: 'Adding it to our list for next year.', deleted: false, created_at: ago(1) },
]

// Anonymous link page (shared_trip_summary / shared_feed shapes).
export const sharedSummary: SharedSummary = {
  tripName: journeySummary.tripName,
  startDate: journeySummary.startDate,
  endDate: journeySummary.endDate,
  route: journeySummary.route,
  travellers: journeySummary.travellers,
}
export const sharedFeed: SharedEvent[] = followingFeed
  .filter((e) => e.trip_id === JOURNEY_TRIP)
  .map((e): SharedEvent => ({ id: e.id, kind: e.kind, occurred_at: e.occurred_at, author: e.author, authorName: e.authorName, payload: e.payload, rating: e.rating, comment: e.comment }))

// ---- Account → Alerts and Follow links (issues #12/#13) --------------------
export const ownTrips: TripListItem[] = [
  { id: 'fixture', name: 'Asia 2026', owner: ME, updated_at: ago(1), created_at: ago(400) },
]
export const notifyPrefs: NotifyPrefs = { ...DEFAULT_NOTIFY_PREFS }
export const tripNotify: TripNotify[] = [{ trip_id: JOURNEY_TRIP, muted: true, all_comments: false }]
export const shares: TripShare[] = [
  { id: 'share-family', trip_id: 'fixture', token_prefix: 'a1b2c3', label: 'Family', created_at: ago(300), expires_at: '2027-01-01T00:00:00Z', revoked_at: null, paused_at: null },
  { id: 'share-office', trip_id: 'fixture', token_prefix: 'd4e5f6', label: 'Office', created_at: ago(200), expires_at: null, revoked_at: null, paused_at: ago(20) },
  // Expired: shows the label and hides Rotate (39 would refuse it anyway).
  { id: 'share-old', trip_id: 'fixture', token_prefix: '9f8e7d', label: 'Summer trip', created_at: ago(900), expires_at: '2026-06-30T23:59:59Z', revoked_at: null, paused_at: null },
]
export const shareStats: ShareStats[] = [
  { share_id: 'share-family', push: 3, email: 2 },
  { share_id: 'share-office', push: 0, email: 1 },
]
