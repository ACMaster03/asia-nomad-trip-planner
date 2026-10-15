'use client'
import { useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, MessageCircle, Users, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { TripEvent } from '@/lib/trips/events'
import type { Segment } from '@/lib/trips/types'
import type { SharedEvent } from '@/lib/follow/api'
import { followMediaUrl } from '@/lib/follow/api'
import { fetchFollowingFeed, fetchMyFollowing, type FollowedEvent, type FollowedSummary, type FollowedTripCard } from '@/lib/follow/follows'
import { fetchFeedSocial, react as sendReaction, REACTION_KINDS, type PostSocial } from '@/lib/follow/social'
import { mergeFeeds } from '@/lib/follow/merge'
import { anyLive, firstSentence, fromLabel, isLive, journeyCards, journeyLine, legInto, names, stopIndexOf, whenLabel } from '@/lib/follow/home'
import { useFollowedRoutes } from '@/lib/follow/useFollowedRoutes'
import { allOverlaps, formatOverlap, meetupKey, meetupQueue, overlappingNow } from '@/lib/map/people'
import { dismissMeetup, dismissedStore } from '@/lib/map/dismissed'
import { tk } from '@/lib/trips/keys'
import { useTripEvents } from '@/lib/trips/useTripEvents'
import { useTripScope } from '@/lib/trips/TripScope'
import { fetchTripTravellers } from '@/lib/trips/travellers'
import { useConfirm } from '@/components/Confirm'
import { EditEventModal } from '@/app/(app)/live/EditEventModal'
import { Avatar } from '@/components/ui/Avatar'
import { ReactChip, Stars } from './SocialRow'

// Your people on Home, as the phone draws them (ios/Livhold/Follow/
// FollowingHome.swift; #130, Patrik, 3 Oct): one card per journey you follow
// (who, where, what's next, the latest post), then "Latest", the newest posts
// across them. A card opens the journey; a post opens its page.
//
// What the web keeps that the phone has not built yet (docs/WEB-IOS-REDESIGN.md,
// round 2b): your own trip's rows in Latest, with Edit and Delete, because Trip
// does not show check-ins under their stops until round 3; the React and
// Comment chips under each post; the meet-up lines (#9); photo thumbnails.
//
// Every social query fails soft: on a database without migrations 33–35 the
// section is your own rows, or nothing.

const PREVIEW = 8
const PAGE = 30
const MAX_MEETUPS = 3

/** The journeys you follow, for Home's placement rules: live ones go above your own journey. */
export function useFollowedCards(today: string) {
  const sb = createClient()
  const following = useQuery({ queryKey: tk.following, queryFn: () => fetchMyFollowing(sb), staleTime: 5 * 60_000, retry: false })
  const people = following.data ?? []
  return { following, people, cards: journeyCards(people, today), anyLive: anyLive(people, today) }
}

export default function FollowingSection({
  today,
  userId,
  own = [],
  ownPending = false,
  segments,
  className = '',
}: {
  today: string
  userId?: string
  /** your own trip's rows (tk.events), kept in Latest until Trip holds them */
  own?: TripEvent[]
  ownPending?: boolean
  /** your own stops, for the meet-up lines */
  segments?: Segment[]
  className?: string
}) {
  const sb = createClient()
  const qc = useQueryClient()
  const { following, people, cards } = useFollowedCards(today)
  const { tripId } = useTripScope()
  const { pausedIds, delEvent } = useTripEvents()
  const confirm = useConfirm()
  const [editEvent, setEditEvent] = useState<TripEvent | null>(null)
  const [shown, setShown] = useState(PREVIEW)

  const followed = useQuery({
    queryKey: tk.followingFeed,
    queryFn: () => fetchFollowingFeed(sb, { limit: 50 }),
    enabled: people.length > 0,
    refetchInterval: 60_000,
    retry: false,
  })
  const feed = useMemo(() => followed.data ?? [], [followed.data])
  // Who posted your own trip's rows: the travellers' first names (migration 47).
  const travellers = useQuery({
    queryKey: tk.travellers(tripId ?? 'none'),
    queryFn: () => fetchTripTravellers(sb, tripId!),
    enabled: tripId !== null && own.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const nameOf = (author: string) => travellers.data?.find((t) => t.id === author)?.name ?? 'A co-traveller'
  // The summaries behind the cards: the route for "Hanoi, day 41 · next Da Nang".
  const summaries = useFollowedRoutes(following.data, true)

  // Latest: check-ins and arrivals (a note is not a post on the phone), newest
  // first, your own rows among them.
  const items = useMemo(
    () => mergeFeeds(own, feed.filter((e) => e.kind === 'checkin' || e.kind === 'arrived'), shown),
    [own, feed, shown],
  )
  const total = own.length + feed.filter((e) => e.kind === 'checkin' || e.kind === 'arrived').length

  const ids = useMemo(() => items.map((i) => i.event.id), [items])
  const social = useQuery({
    queryKey: tk.feedSocial(ids),
    queryFn: () => fetchFeedSocial(sb, ids),
    enabled: ids.length > 0,
    refetchInterval: 60_000,
    retry: false,
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

  // Where your routes touch (#9), today only; each line stays until dismissed.
  const dismissed = useSyncExternalStore(dismissedStore.subscribe, dismissedStore.snapshot(userId), dismissedStore.serverSnapshot)
  const meetups = useMemo(
    () => meetupQueue(overlappingNow(allOverlaps(segments ?? [], people, summaries, today), today), dismissed, MAX_MEETUPS),
    [segments, people, summaries, today, dismissed],
  )

  if (cards.length === 0 && items.length === 0 && meetups.length === 0) {
    if (ownPending) return <p className={'text-[15px] text-tx2 ' + className}>Loading…</p>
    return null
  }

  return (
    <section className={'flex flex-col gap-3 ' + className}>
      {cards.length > 0 && (
        <>
          <SectionLabel>Journeys you follow</SectionLabel>
          {cards.map((c) => (
            <JourneyCard key={c.trip_id} card={c} summary={summaries[c.trip_id]} feed={feed} today={today} />
          ))}
        </>
      )}
      {meetups.length > 0 && (
        <ul className="lv-settle flex flex-col rounded-[var(--r)] bg-sf px-3.5 py-1 text-tx">
          {meetups.map((o) => (
            <li key={meetupKey(o)} className="flex items-start gap-2.5 text-[15px] leading-snug">
              <Link href="/map" className="flex min-h-11 flex-1 items-start gap-2.5 py-2.5">
                <Users aria-hidden className="mt-[3px] size-4 flex-none text-ac2-deep" strokeWidth={2} />
                <span>{formatOverlap(o, o.names, today)}</span>
              </Link>
              <button
                type="button"
                onClick={() => dismissMeetup(userId, meetupKey(o))}
                aria-label={`Dismiss: ${formatOverlap(o, o.names, today)}`}
                className="-mr-2 inline-flex size-11 flex-none items-center justify-center text-tx2"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <>
          <SectionLabel className={cards.length > 0 ? 'pt-1.5' : ''}>Latest</SectionLabel>
          {items.map((it) => {
            const own = it.source === 'own'
            const e: SharedEvent = own ? ownAsShared(it.event) : it.event
            const summary = own ? undefined : summaries[it.event.trip_id]
            const who = own ? (userId && it.event.author === userId ? 'You' : nameOf(it.event.author)) : it.label
            const s = socialById.get(e.id) ?? { commentCount: 0 }
            return (
              <FeedItem
                key={e.id}
                e={e}
                who={who}
                summary={summary}
                feed={own ? [] : feed}
                href={`/post/${e.id}`}
                social={s}
                onReact={(kind) => reactMut.mutate({ id: e.id, kind })}
                reacting={reactMut.isPending && reactMut.variables?.id === e.id}
                queued={own && pausedIds.has(e.id)}
                edited={own && !!it.event.edited_at}
                onEdit={own && mine(it.event, userId) && (it.event.kind === 'checkin' || it.event.kind === 'note') ? () => setEditEvent(it.event) : undefined}
                onDelete={
                  own && mine(it.event, userId)
                    ? async () => {
                        const what = it.event.kind === 'note' ? 'note' : 'check-in'
                        if (await confirm({ title: `Delete this ${what}?` })) delEvent.mutate(it.event.id)
                      }
                    : undefined
                }
              />
            )
          })}
          {items.length < total && (
            <button
              type="button"
              onClick={() => setShown((n) => (n === PREVIEW ? PAGE : n + PAGE))}
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-[var(--rCtl)] border-[1.5px] border-ln2 bg-sf text-base font-medium"
            >
              Show older
              <ChevronRight className="size-4 rotate-90" aria-hidden />
            </button>
          )}
        </>
      )}
      {editEvent && tripId && <EditEventModal ev={editEvent} tripId={tripId} onClose={() => setEditEvent(null)} />}
    </section>
  )
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={'text-[12px] font-semibold uppercase tracking-[.083em] text-tx3 ' + className}>{children}</div>
}

/** One journey you follow: who, where, what's next, the latest post. Opens the journey. */
function JourneyCard({ card, summary, feed, today }: { card: FollowedTripCard; summary: FollowedSummary | null | undefined; feed: FollowedEvent[]; today: string }) {
  const travellers = summary?.travellers?.length ? summary.travellers : card.travellers
  const paused = card.state === 'paused' || summary?.paused === true
  const live = !paused && isLive(card, today)
  const line = journeyLine(card, summary, feed, today)
  const events = feed.filter((e) => e.trip_id === card.trip_id)
  const latest = events.find((e) => e.kind === 'checkin' || e.kind === 'arrived')
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className="flex flex-none">
          {travellers.slice(0, 3).map((t, i) => (
            <span key={t.id} className={'rounded-full ring-2 ring-sf ' + (i > 0 ? '-ml-2' : '')}>
              <Avatar name={t.name} size={26} />
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-tx2">{names(travellers.map((t) => t.name))}</span>
        {live && (
          <span className="flex-none rounded-full bg-ac-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[.055em] text-ac">Live</span>
        )}
      </div>
      <div className="mt-2 font-serif text-[22px] font-semibold leading-[1.2] text-tx">{card.tripName || summary?.tripName}</div>
      {paused ? (
        <p className="mt-1.5 text-[14px] text-tx3">Sharing is paused for now</p>
      ) : (
        <>
          {line && <p className="mt-1.5 text-[14px] text-tx2">{line}</p>}
          {summary && latest && (
            <p className="mt-2 line-clamp-2 border-t border-ln pt-2 text-[14px] text-tx2">
              <LatestLine e={latest} summary={summary} feed={events} />
            </p>
          )}
          <p className="mt-2 flex items-center gap-[3px] text-[14px] font-semibold text-ac">
            Open the journey <ChevronRight aria-hidden className="size-[11px]" strokeWidth={2.8} />
          </p>
        </>
      )}
    </>
  )
  const cls = 'lv-settle block rounded-[var(--r)] bg-sf px-4 py-3.5 text-tx shadow-[0_1px_3px_rgba(0,0,0,.05)]'
  if (paused) return <div className={cls + ' opacity-70'}>{body}</div>
  return (
    <Link href={`/journeys/${card.trip_id}`} className={cls}>
      {body}
    </Link>
  )
}

/** "**Arrived in Hue** · 2 hours ago" or "**Café**, Hanoi · yesterday · “Rainy and perfect.”" */
function LatestLine({ e, summary, feed }: { e: FollowedEvent; summary: FollowedSummary; feed: FollowedEvent[] }) {
  const when = whenLabel(e.occurred_at)
  if (e.kind === 'arrived') {
    return (
      <>
        <span className="font-semibold text-tx">Arrived in {e.payload.city ?? ''}</span> · {when}
      </>
    )
  }
  const i = stopIndexOf(summary.route, feed, e)
  const city = i !== null ? summary.route[i]?.city : ''
  const quote = firstSentence(e.comment)
  return (
    <>
      <span className="font-semibold text-tx">{e.payload.placeName ?? 'Checked in'}</span>
      {city ? `, ${city}` : ''} · {when}
      {quote ? ` · “${quote}”` : ''}
    </>
  )
}

/** One post in Latest: an arrival on the soft mauve, a check-in on the surface. */
function FeedItem({
  e, who, summary, feed, href, social, onReact, reacting, queued, edited, onEdit, onDelete,
}: {
  e: SharedEvent
  who: string
  summary?: FollowedSummary | null
  feed: FollowedEvent[]
  href: string
  social: Pick<PostSocial, 'mine' | 'commentCount' | 'tally'>
  onReact: (kind: string | null) => void
  reacting: boolean
  queued?: boolean
  edited?: boolean
  onEdit?: () => void
  onDelete?: () => void
}) {
  const arrival = e.kind === 'arrived'
  const when = whenLabel(e.occurred_at)
  const i = summary && !arrival ? stopIndexOf(summary.route, feed, e) : null
  const city = i !== null && summary ? summary.route[i]?.city : ''
  const from = (() => {
    if (!arrival || !summary) return null
    const j = stopIndexOf(summary.route, feed, e)
    if (j === null || j <= 0) return null
    return fromLabel(summary.route[j - 1].city, legInto(summary, j)?.mode)
  })()
  const photos = e.payload.photos ?? []
  const count = social.commentCount
  const glyphOf = (k?: string | null) => (k ? (REACTION_KINDS.find((r) => r.key === k)?.glyph ?? '＋') : null)
  return (
    <article
      className={
        'rounded-[calc(var(--r)-4px)] px-3.5 py-3 text-tx ' +
        (arrival ? 'bg-ac2-soft' : 'bg-sf shadow-[0_1px_3px_rgba(0,0,0,.05)]')
      }
    >
      <Link href={href} className="block">
        <p className="text-[13px] text-tx3">
          <span className="font-semibold text-tx">{who}</span>
          {arrival ? ` · ${when}` : e.kind === 'checkin' ? ` checked in · ${when}` : ` · ${when}`}
          {edited ? ' · edited' : ''}
        </p>
        {arrival ? (
          <>
            <p className="mt-1 font-serif text-[16px] font-semibold text-ac2-deep">Arrived in {e.payload.city ?? ''}</p>
            {from && <p className="mt-0.5 text-[14px] text-tx2">{from}</p>}
          </>
        ) : (
          <>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 font-serif text-[16px] font-semibold">
              <span>{e.kind === 'checkin' ? `${e.payload.placeName ?? 'Checked in'}${city ? `, ${city}` : ''}` : e.payload.text ?? 'Note'}</span>
              {e.rating ? <span className="font-sans text-[12px] tracking-[.1em]"><Stars n={e.rating} /></span> : null}
            </p>
            {e.kind === 'checkin' && e.comment && <p className="mt-0.5 line-clamp-3 text-[14px] text-tx2">“{e.comment}”</p>}
            {photos.length > 0 && (
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {photos.slice(0, 3).map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p} src={followMediaUrl(p)} alt="" className="h-16 w-16 rounded-[12px] object-cover" />
                ))}
                {photos.length > 3 && (
                  <span className="flex h-16 w-16 items-center justify-center rounded-[12px] bg-fill text-[14px] font-semibold text-tx2">+{photos.length - 3}</span>
                )}
              </span>
            )}
            {count > 0 && <p className="mt-1 text-[12.5px] font-medium text-ac">{count === 1 ? '1 comment' : `${count} comments`}</p>}
          </>
        )}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ReactChip
          mine={social.mine ?? null}
          glyph={glyphOf(social.mine)}
          total={(social.tally ?? []).reduce((a, t) => a + t.count, 0)}
          tally={social.tally}
          onReact={onReact}
          busy={reacting}
        />
        <Link href={href} className="inline-flex h-8 items-center gap-1 rounded-full bg-fill px-2.5 text-[13px] font-semibold text-tx2">
          <MessageCircle aria-hidden className="size-4" strokeWidth={2} />
          {count > 0 ? count : 'Comment'}
        </Link>
        {onEdit && (
          <button type="button" onClick={onEdit} className="inline-flex h-8 items-center rounded-full bg-fill px-2.5 text-[13px] font-semibold text-tx2">
            Edit
          </button>
        )}
        {onDelete && (
          <button type="button" onClick={onDelete} className="inline-flex h-8 items-center rounded-full bg-fill px-2.5 text-[13px] font-semibold text-ac2-deep">
            Delete
          </button>
        )}
        {queued && (
          <span className="inline-flex h-8 items-center rounded-full border-[1.4px] border-warn-line px-2.5 text-[13px] font-semibold text-warn">queued</span>
        )}
      </div>
    </article>
  )
}

const mine = (e: TripEvent, userId?: string) => !!userId && e.author === userId

// A trip's own row (tk.events shape) in the follower-projection shape the
// feed renders — rating and comment flat, photos under payload.
function ownAsShared(e: TripEvent): SharedEvent {
  return {
    id: e.id,
    kind: e.kind,
    occurred_at: e.occurred_at,
    author: e.author,
    authorName: '',
    payload: {
      placeName: typeof e.payload.placeName === 'string' ? e.payload.placeName : undefined,
      text: typeof e.payload.text === 'string' ? e.payload.text : undefined,
      city: typeof e.payload.city === 'string' ? e.payload.city : undefined,
      photos: Array.isArray(e.payload.photos) ? (e.payload.photos as string[]) : undefined,
    },
    rating: e.check_in?.rating ?? null,
    comment: e.check_in?.comment ?? null,
  }
}
