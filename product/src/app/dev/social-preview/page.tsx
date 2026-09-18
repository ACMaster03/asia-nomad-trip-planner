import { notFound } from 'next/navigation'
import { dehydrate, QueryClient } from '@tanstack/react-query'
import { HydrationBoundary } from '@/lib/query/HydrationBoundary'
import { tk } from '@/lib/trips/keys'
import { fixtureTrip } from '../money-preview/fixture'
import * as fx from './fixture'
import Preview, { type Screen } from './Preview'

// DEV ONLY: the social screens from fixtures, no sign-in needed. Same wiring
// as money-preview — server-seeded cache, dehydrated into the boundary. The
// RPC refetches fail against a real database (no session), and React Query
// keeps the seeded data on error, which is exactly what a preview wants.
//   ?screen=home | nohome (follower without a trip) | journey | people | post | follow
const SCREENS: Screen[] = ['home', 'nohome', 'nobody', 'notrip', 'journey', 'people', 'post', 'follow', 'alerts', 'sharing']

export default async function SocialPreviewPage({ searchParams }: { searchParams: Promise<{ screen?: string; tab?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const params = await searchParams
  const screen = SCREENS.includes(params.screen as Screen) ? (params.screen as Screen) : 'home'
  const qc = new QueryClient()
  qc.setQueryData(tk.trip('fixture'), fixtureTrip(new Date().toISOString().slice(0, 10)))
  qc.setQueryData(tk.events('fixture'), fx.ownEvents)
  // 'nobody': a follower account whose follow never completed — nothing to show
  qc.setQueryData(tk.following, screen === 'nobody' ? [] : fx.following)
  qc.setQueryData(tk.followers, screen === 'nobody' ? [] : fx.followers)
  qc.setQueryData(['follower-count'], screen === 'nobody' ? 0 : fx.followers.length)
  qc.setQueryData(tk.followingFeed, screen === 'nobody' ? [] : fx.followingFeed)
  qc.setQueryData(tk.followedSummary(fx.JOURNEY_TRIP), fx.journeySummary)
  qc.setQueryData(tk.post(fx.POST_ID), fx.followingFeed[0])
  qc.setQueryData(tk.comments(fx.POST_ID), fx.comments)
  qc.setQueryData(['shared-summary', fx.TOKEN], fx.sharedSummary)
  // alerts + sharing (issues #12/#13)
  qc.setQueryData(tk.trips, fx.ownTrips)
  qc.setQueryData(tk.notifyPrefs, fx.notifyPrefs)
  qc.setQueryData(tk.tripNotify, fx.tripNotify)
  qc.setQueryData(tk.shares('fixture'), fx.shares)
  qc.setQueryData(['share-stats', 'fixture'], fx.shareStats)
  qc.setQueryData(['follower-access', 'fixture'], 'on')
  qc.setQueryData(['shared-feed', fx.TOKEN], fx.sharedFeed)
  qc.setQueryData(['shared-feed-social', fx.TOKEN, fx.sharedFeed.map((e) => e.id).join(',')], fx.feedSocial.map(({ event_id, commentCount }) => ({ event_id, commentCount })))
  // every id set the screens will ask for
  const idSets = [
    fx.ownEvents.map((e) => e.id).concat(fx.followingFeed.map((e) => e.id)),
    fx.followingFeed.filter((e) => e.trip_id === fx.JOURNEY_TRIP).map((e) => e.id),
    [fx.POST_ID],
  ]
  for (const ids of idSets) qc.setQueryData(tk.feedSocial(ids), fx.feedSocial.filter((r) => ids.includes(r.event_id)))
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <Preview screen={screen} tab={params.tab === 'followers' ? 'followers' : 'following'} />
    </HydrationBoundary>
  )
}
