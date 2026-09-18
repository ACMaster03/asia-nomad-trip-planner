'use client'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, CirclePause, Compass, SlidersHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchFollowedSummary, fetchFollowingFeed, unfollow, type FollowedEvent } from '@/lib/follow/follows'
import { fetchFeedSocial, react as sendReaction, type PostSocial } from '@/lib/follow/social'
import { SocialRow } from '@/components/social/SocialRow'
import { Sheet } from '@/app/(app)/live/Sheet'
import { Toggle } from '@/components/trips/NotificationSettings'
import { fetchTripNotify, setTripNotify, type TripNotify } from '@/lib/trips/userPush'
import { tk } from '@/lib/trips/keys'
import { localISODate, nightsBetween, timeAgo } from '@/lib/trips/format'

// /journeys/[trip] — a followed trip, signed in. The same page the anonymous
// link shows (globe, current stop, updates), read through the account instead
// of a token, so the feed carries only the posts of the travellers this
// person follows. Everything about the relationship lives behind the
// top-right sliders: whose posts you see, and stop following.

const FollowGlobe = dynamic(() => import('@/components/follow/FollowGlobe'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-base text-tx3">Loading globe…</div>,
})

const kicker = 'text-base font-medium uppercase tracking-[.14em] text-ac2-deep'
const card = 'rounded-[var(--r)] bg-sf'

export default function JourneyClient({ tripId }: { tripId: string }) {
  const sb = createClient()
  const qc = useQueryClient()
  const router = useRouter()
  // "today" is clock-dependent → known only after mount (SSR/hydration safety).
  const mounted = useSyncExternalStore(subscribeNever, snapTrue, snapFalse)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const summary = useQuery({
    queryKey: tk.followedSummary(tripId),
    queryFn: () => fetchFollowedSummary(sb, tripId),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })
  // following_feed is cross-trip (Home reads it too); this page keeps its
  // rows for one trip. The cache entry is shared with Home on purpose.
  const feed = useQuery({
    queryKey: tk.followingFeed,
    queryFn: () => fetchFollowingFeed(sb, { limit: 50 }),
    enabled: !!summary.data && !summary.data.paused,
    refetchInterval: 45_000,
  })
  const events = useMemo(
    () => (feed.data ?? []).filter((e) => e.trip_id === tripId),
    [feed.data, tripId],
  )
  const ids = useMemo(() => events.map((e) => e.id), [events])
  const social = useQuery({
    queryKey: tk.feedSocial(ids),
    queryFn: () => fetchFeedSocial(sb, ids),
    enabled: ids.length > 0,
    refetchInterval: 45_000,
  })
  const socialById = useMemo(() => new Map((social.data ?? []).map((r) => [r.event_id, r])), [social.data])

  const reactMut = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: string | null }) => sendReaction(sb, id, kind),
    onSuccess: (row: PostSocial) => {
      qc.setQueryData<PostSocial[]>(tk.feedSocial(ids), (old) =>
        (old ?? []).some((r) => r.event_id === row.event_id)
          ? (old ?? []).map((r) => (r.event_id === row.event_id ? row : r))
          : [...(old ?? []), row],
      )
    },
  })

  // Realtime ping, same as the anonymous page: it carries nothing, it just
  // says "re-read".
  const topic = summary.data?.broadcastTopic
  useEffect(() => {
    if (!topic) return
    const channel = sb.channel(topic)
    channel
      .on('broadcast', { event: 'trip_update' }, () => {
        qc.invalidateQueries({ queryKey: tk.followingFeed })
        qc.invalidateQueries({ queryKey: tk.followedSummary(tripId) })
      })
      .subscribe()
    return () => {
      sb.removeChannel(channel)
    }
  }, [sb, qc, topic, tripId])

  const s = summary.data
  if (summary.isPending) return <Shell><p className="text-base text-tx2">Loading…</p></Shell>
  if (!s) {
    return (
      <Shell>
        <BackLink />
        <div className="mt-16 text-center">
          <Compass size={40} strokeWidth={2} className="mx-auto text-ac2" aria-hidden />
          <h1 className="mt-4 font-serif text-2xl font-semibold">Nothing to show here</h1>
          <p className="mx-auto mt-2 max-w-xs text-base leading-[1.55] text-tx2">
            You don&apos;t follow anyone on this trip any more, or the travellers closed it to followers.
          </p>
        </div>
      </Shell>
    )
  }
  if (s.paused) {
    return (
      <Shell>
        <BackLink />
        <header className="mb-4 mt-2">
          <div className={kicker}>Following</div>
          <h1 className="mt-1 font-serif text-[27px] font-semibold leading-[1.15] tracking-[-.01em]">{s.tripName}</h1>
        </header>
        <section className={`${card} p-6 text-center`}>
          <CirclePause size={36} strokeWidth={2} className="mx-auto text-ac2" aria-hidden />
          <h2 className="mt-3 font-serif text-xl font-semibold">Sharing is paused</h2>
          <p className="mx-auto mt-2 max-w-sm text-base leading-[1.55] text-tx2">
            The travellers have paused sharing for a while. This page fills up again the moment
            they resume.
          </p>
        </section>
      </Shell>
    )
  }

  const today = mounted ? localISODate() : s.startDate
  const phase: 'pre' | 'live' | 'post' =
    today < s.startDate ? 'pre' : s.endDate && today > s.endDate ? 'post' : 'live'
  const current = s.route.find((r) => r.arrive <= today && today < r.depart) ?? null
  const latest = events[0]
  const quietDays = latest && mounted ? nightsBetween(latest.occurred_at.slice(0, 10), today) : null
  const dayNum = nightsBetween(s.startDate, today) + 1
  const totalDays = s.endDate ? nightsBetween(s.startDate, s.endDate) + 1 : null
  const lastSeenCity = events.find((e) => e.kind === 'arrived')?.payload.city ?? current?.city ?? null
  const followedNames = s.travellers.filter((t) => s.following.includes(t.id)).map((t) => t.name)

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <BackLink />
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Following settings"
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ac2"
        >
          <SlidersHorizontal className="size-5" aria-hidden />
        </button>
      </div>

      <header className="mb-4 mt-1">
        <div className={kicker}>Following {followedNames.join(' & ')}</div>
        <h1 className="mt-1 font-serif text-[27px] font-semibold leading-[1.15] tracking-[-.01em]">{s.tripName}</h1>
        <div className="mt-2.5 inline-flex items-center rounded-full bg-tag px-3.5 py-1.5 text-base font-medium text-tag-ink">
          {phase === 'pre' && 'Departure countdown'}
          {phase === 'live' && (totalDays ? `Day ${dayNum} of ${totalDays}` : `Day ${dayNum}`)}
          {phase === 'post' && 'Trip complete'}
        </div>
        {phase === 'live' && lastSeenCity && latest && (
          <p className="mt-2 text-base text-tx2">
            Last seen: <span className="font-medium text-tx">{lastSeenCity}</span> · {timeAgo(latest.occurred_at)}
          </p>
        )}
      </header>

      {phase === 'pre' ? (
        <section className={`${card} p-6 text-center`}>
          <div className="font-serif text-5xl font-semibold text-ac">{nightsBetween(today, s.startDate)}</div>
          <div className="mt-1 text-base text-tx2">days until departure · {s.startDate}</div>
          {s.route.length > 0 && (
            <p className="mt-4 text-base leading-[1.55] text-tx2">Planned route: {s.route.map((r) => r.city).join(' → ')}</p>
          )}
        </section>
      ) : (
        <>
          {s.route.some((r) => r.lat != null) && (
            <>
              <section className={`${card} h-72 overflow-hidden`}>
                <FollowGlobe
                  route={s.route}
                  currentCity={current?.city ?? null}
                  todayISO={today}
                  lastSeenCity={lastSeenCity}
                  stale={quietDays !== null && quietDays >= 3}
                />
              </section>
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-base text-tx2">
                <span><span className="text-ac">●</span> visited</span>
                <span><span className="text-warn">◉</span> last seen</span>
                <span><span className="text-ac2">○</span> upcoming</span>
              </p>
            </>
          )}

          {current && (
            <section className={`${card} mt-3 p-4`}>
              <div className="text-base font-medium uppercase tracking-[.12em] text-ac2-deep">Now in</div>
              <div className="mt-0.5 text-[17px] font-semibold">{current.city}, {current.country}</div>
              <div className="text-base text-tx2">{current.arrive} → {current.depart}</div>
            </section>
          )}

          {phase === 'live' && quietDays !== null && quietDays >= 3 && (
            <p className="mt-3 rounded-[var(--r)] bg-tag p-4 text-center text-base leading-[1.55] text-tag-ink">
              Quiet days on the road — no updates in {quietDays} days. No news is usually good news.
            </p>
          )}

          <section className="mt-5">
            <h2 className="mb-2 text-base font-semibold uppercase tracking-[.12em] text-ac2-deep">Updates</h2>
            {feed.isPending && <p className="text-base text-tx2">Loading updates…</p>}
            {!feed.isPending && !events.length && (
              <p className="text-base text-tx2">
                {phase === 'post' ? 'The journal has ended — thanks for following along!' : 'No updates yet — check back soon.'}
              </p>
            )}
            {events.length > 0 && (
              <ul className={`${card} px-3.5`}>
                {events.map((e: FollowedEvent) => (
                  <SocialRow
                    key={e.id}
                    e={e}
                    href={`/post/${e.id}`}
                    byline={e.authorName}
                    social={socialById.get(e.id) ?? { commentCount: 0 }}
                    onReact={(kind) => reactMut.mutate({ id: e.id, kind })}
                    reacting={reactMut.isPending && reactMut.variables?.id === e.id}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {settingsOpen && (
        <FollowSettings
          tripId={tripId}
          tripName={s.tripName}
          travellers={s.travellers}
          following={s.following}
          onClose={() => setSettingsOpen(false)}
          onLeft={() => router.push('/people')}
        />
      )}
    </Shell>
  )
}

const subscribeNever = () => () => {}
const snapTrue = () => true
const snapFalse = () => false

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-pg text-tx">
      <main className="lv-enter mx-auto max-w-xl px-4 py-4 sm:px-6">{children}</main>
    </div>
  )
}

function BackLink() {
  return (
    <Link href="/dashboard" className="-ml-1 inline-flex min-h-11 items-center gap-1 text-base font-semibold text-ac2">
      <ChevronLeft className="size-5" aria-hidden /> Home
    </Link>
  )
}

// Whose posts you see on this trip, and the way out. Unticking a traveller
// unfollows that person everywhere (following is per person, not per trip),
// so the sheet says so before it does it. Ticking someone back on needs the
// link they were shared with — there is no "follow by id" on purpose.
function FollowSettings({
  tripId, tripName, travellers, following, onClose, onLeft,
}: {
  tripId: string
  tripName: string
  travellers: { id: string; name: string }[]
  following: string[]
  onClose: () => void
  onLeft: () => void
}) {
  const sb = createClient()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState<{ id: string; name: string } | 'all' | null>(null)
  const followedHere = travellers.filter((t) => following.includes(t.id))

  // Per-trip mute (migration 37): the one switch a follower reaches for when
  // a trip gets chatty. Everything else lives under Account → Alerts.
  const tripNotify = useQuery({ queryKey: tk.tripNotify, queryFn: () => fetchTripNotify(sb), retry: false })
  const muted = tripNotify.data?.find((r) => r.trip_id === tripId)?.muted ?? false
  const mute = useMutation({
    mutationFn: (m: boolean) => setTripNotify(sb, tripId, { muted: m }, tripNotify.data?.find((r) => r.trip_id === tripId)),
    onMutate: async (m) => {
      await qc.cancelQueries({ queryKey: tk.tripNotify })
      const prev = qc.getQueryData<TripNotify[]>(tk.tripNotify) ?? []
      const cur = prev.find((r) => r.trip_id === tripId) ?? { trip_id: tripId, muted: false, all_comments: false }
      qc.setQueryData(tk.tripNotify, [...prev.filter((r) => r.trip_id !== tripId), { ...cur, muted: m }])
      return { prev }
    },
    onError: (_e, _m, ctx) => { if (ctx?.prev) qc.setQueryData(tk.tripNotify, ctx.prev) },
    onSettled: () => qc.invalidateQueries({ queryKey: tk.tripNotify }),
  })

  const leave = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await unfollow(sb, id)
    },
    onSuccess: (_d, ids) => {
      qc.invalidateQueries({ queryKey: tk.following })
      qc.invalidateQueries({ queryKey: tk.followingFeed })
      qc.invalidateQueries({ queryKey: tk.followedSummary(tripId) })
      setConfirm(null)
      if (ids.length >= followedHere.length) onLeft()
    },
  })

  return (
    <Sheet label="Following settings" onClose={onClose}>
      <h2 className="font-serif text-[21px] font-semibold">Whose posts you see</h2>
      <p className="-mt-2 text-base leading-[1.5] text-tx2">
        On {tripName}. Arrivals show for the whole trip; check-ins and notes only from the people you follow.
      </p>
      <ul className="flex flex-col gap-1">
        {travellers.map((t) => {
          const on = following.includes(t.id)
          return (
            <li key={t.id} className="flex items-center justify-between rounded-[14px] bg-fill px-3.5 py-2.5">
              <span className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-full bg-ac2-soft text-[13px] font-bold text-ac2-deep">
                  {t.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-base font-semibold">{t.name}</span>
              </span>
              {on ? (
                <button
                  type="button"
                  onClick={() => setConfirm({ id: t.id, name: t.name })}
                  className="rounded-full border-[1.4px] border-ln3 px-3 py-1.5 text-base font-medium text-tx2"
                >
                  Following
                </button>
              ) : (
                <span className="text-base text-tx3">Not following</span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-[13px] leading-[1.5] text-tx3">
        To follow someone you don&apos;t yet, open the link they shared with you.
      </p>

      <div className="flex items-center gap-3 rounded-[14px] bg-fill px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">Alerts for this trip</div>
          <div className="mt-0.5 text-base leading-[1.4] text-tx2">
            {muted ? 'Muted — nothing from this trip buzzes' : 'New posts buzz, as set under Account → Alerts'}
          </div>
        </div>
        <Toggle on={!muted} disabled={tripNotify.isPending} label="Alerts for this trip" onChange={(v) => mute.mutate(!v)} />
      </div>

      {confirm && (
        <div className="rounded-[14px] bg-warn-soft p-3.5 text-base leading-[1.5]">
          <p className="text-warn">
            {confirm === 'all'
              ? `Stop following ${followedHere.map((t) => t.name).join(' and ')}? You will no longer see their posts, on this trip or any other.`
              : `Stop following ${confirm.name}? You will no longer see their posts, on this trip or any other.`}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={leave.isPending}
              onClick={() => leave.mutate(confirm === 'all' ? followedHere.map((t) => t.id) : [confirm.id])}
              className="rounded-full border-[1.4px] border-warn-line px-3.5 py-1.5 text-base font-semibold text-warn disabled:opacity-50"
            >
              {leave.isPending ? '…' : 'Stop following'}
            </button>
            <button type="button" onClick={() => setConfirm(null)} className="rounded-full border-[1.4px] border-ln3 px-3.5 py-1.5 text-base font-medium text-tx2">
              Keep
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setConfirm('all')}
        className="mt-1 text-left text-base font-medium text-tx3"
      >
        Stop following this trip&apos;s travellers
      </button>
      <button type="button" onClick={onClose} className="rounded-[var(--rCtl)] border-[1.5px] border-ln2 bg-sf py-3 text-base font-medium">
        Done
      </button>
    </Sheet>
  )
}
