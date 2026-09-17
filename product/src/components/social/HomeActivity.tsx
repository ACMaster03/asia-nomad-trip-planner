'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { TripEvent } from '@/lib/trips/events'
import type { SharedEvent } from '@/lib/follow/api'
import { fetchFollowingFeed, fetchMyFollowerCount, fetchMyFollowing } from '@/lib/follow/follows'
import { fetchFeedSocial, react as sendReaction, type PostSocial } from '@/lib/follow/social'
import { mergeFeeds } from '@/lib/follow/merge'
import { currentTrip } from '@/lib/follow/people'
import { tk } from '@/lib/trips/keys'
import { SocialRow } from './SocialRow'

// Home's activity: the people strip, then one feed of this trip's own rows
// and the posts of the people you follow, newest first, 30 at a time.
// The two sources never share a query — tk.events is the trip's own
// authorization, following_feed the follower projection — they only meet in
// mergeFeeds. Every social query here fails soft: on a database without
// migrations 33–35 the feed is simply your own rows.

const PAGE = 30

export default function HomeActivity({ own, ownPending, userId }: { own: TripEvent[]; ownPending: boolean; userId?: string }) {
  const sb = createClient()
  const qc = useQueryClient()
  const [onlyMine, setOnlyMine] = useState(false)
  const [shown, setShown] = useState(PAGE)

  const following = useQuery({ queryKey: tk.following, queryFn: () => fetchMyFollowing(sb), staleTime: 5 * 60_000, retry: false })
  const followerCount = useQuery({ queryKey: ['follower-count'], queryFn: () => fetchMyFollowerCount(sb), staleTime: 5 * 60_000, retry: false })
  const followed = useQuery({
    queryKey: tk.followingFeed,
    queryFn: () => fetchFollowingFeed(sb, { limit: 50 }),
    enabled: (following.data?.length ?? 0) > 0,
    refetchInterval: 60_000,
    retry: false,
  })

  const items = useMemo(
    () => mergeFeeds(own, onlyMine ? [] : (followed.data ?? []), shown),
    [own, followed.data, onlyMine, shown],
  )
  const total = own.length + (onlyMine ? 0 : (followed.data?.length ?? 0))

  // Reactions and comment counts for what is on screen. Own rows count too:
  // a traveller sees the tally under their own check-in.
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

  const people = following.data ?? []
  const travelling = people.filter((p) => currentTrip(p.trips)?.state === 'on' && currentTrip(p.trips)?.currentCity)

  return (
    <>
      {/* people strip: who you follow, who follows you — the door to /people */}
      {(people.length > 0 || (followerCount.data ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/people" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ac2-soft px-3 text-base font-semibold text-ac2-deep">
            Following {people.length}
          </Link>
          <Link href="/people?tab=followers" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-fill px-3 text-base font-semibold text-tx2">
            {followerCount.data ?? 0} follower{followerCount.data === 1 ? '' : 's'}
          </Link>
          {travelling.length > 0 && (
            <span className="text-base text-tx2">
              {travelling.length === 1 ? `${travelling[0].name} is travelling` : `${travelling.length} travelling now`}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="whitespace-nowrap text-base font-semibold uppercase tracking-[.12em] text-tx2">Activity{total > 0 ? ` · ${total}` : ''}</span>
        <div className="flex flex-none items-center gap-2">
          {people.length > 0 && (
            <button
              type="button"
              onClick={() => setOnlyMine((v) => !v)}
              aria-pressed={onlyMine}
              className={'whitespace-nowrap rounded-full px-2.5 py-1 text-base font-semibold ' + (onlyMine ? 'bg-ac2-soft text-ac2-deep' : 'text-tx2')}
            >
              Only mine
            </button>
          )}
          <Link href="/live" className="-my-2.5 inline-flex min-h-11 items-center whitespace-nowrap text-base font-semibold text-ac2">Check-ins ›</Link>
        </div>
      </div>

      {ownPending && items.length === 0 && <p className="text-base text-tx2">Loading…</p>}
      {!ownPending && items.length === 0 && (
        <p className="rounded-[var(--r)] bg-sf p-4 text-base leading-[1.55] text-tx2">
          Nothing here yet. Your check-ins and the posts of the people you follow gather here.
        </p>
      )}
      {items.length > 0 && (
        <ul className="rounded-[var(--r)] bg-sf px-3.5 text-tx">
          {items.map((it) =>
            it.source === 'own' ? (
              <SocialRow
                key={it.event.id}
                e={ownAsShared(it.event)}
                href={`/post/${it.event.id}`}
                byline={userId && it.event.author === userId ? 'You' : 'Co-traveller'}
                tone="tag"
                social={socialById.get(it.event.id) ?? { commentCount: 0 }}
                onReact={(kind) => reactMut.mutate({ id: it.event.id, kind })}
                reacting={reactMut.isPending && reactMut.variables?.id === it.event.id}
              />
            ) : (
              <SocialRow
                key={it.event.id}
                e={it.event}
                href={`/post/${it.event.id}`}
                byline={`${it.label} · ${it.trip}`}
                social={socialById.get(it.event.id) ?? { commentCount: 0 }}
                onReact={(kind) => reactMut.mutate({ id: it.event.id, kind })}
                reacting={reactMut.isPending && reactMut.variables?.id === it.event.id}
              />
            ),
          )}
        </ul>
      )}
      {items.length < total && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded-[var(--rCtl)] border-[1.5px] border-ln2 bg-sf text-base font-medium"
        >
          Show older <ChevronRight className="size-4 rotate-90" aria-hidden />
        </button>
      )}
    </>
  )
}

// A trip's own row (tk.events shape) in the follower-projection shape the
// shared row renders — rating and comment flat, photos under payload.
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
