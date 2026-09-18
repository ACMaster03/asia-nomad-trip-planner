'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Bell, CirclePause, Compass, Mail, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchSharedFeed, fetchSharedSummary, subscribeDigest, type SharedEvent, type SharedSummary, type Traveller } from '@/lib/follow/api'
import { followByToken } from '@/lib/follow/follows'
import { fetchSharedFeedSocial } from '@/lib/follow/social'
import { clearPendingFollow, readPendingFollow, savePendingFollow } from '@/lib/follow/pending'
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/follow/push'
import { SocialRow } from '@/components/social/SocialRow'
import { tk } from '@/lib/trips/keys'
import { localISODate, nightsBetween, timeAgo } from '@/lib/trips/format'

// /follow/[token] — the no-account family view (LIVHOLD handoff frame 30).
// States: invalid link · pre-trip countdown · live (globe + current stop +
// feed, polled ~45s as the floor, plus a Realtime ping that usually beats it
// to ~1s — Postgres Changes can't reach anon under closed RLS) ·
// post-trip. Everything rendered here comes from the sanitized RPCs; there is
// nothing more to find in dev-tools than what this page shows.

const FollowGlobe = dynamic(() => import('@/components/follow/FollowGlobe'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-base text-tx3">Loading globe…</div>
  ),
})

const kicker = 'text-base font-medium uppercase tracking-[.14em] text-ac2-deep'
const card = 'rounded-[var(--r)] bg-sf'

export default function FollowClient({
  token, initialSummary,
}: { token: string; initialSummary: SharedSummary | null }) {
  const sb = createClient()
  const qc = useQueryClient()
  const router = useRouter()

  // "today" is clock-dependent → compute after mount (SSR/hydration safety).
  const mounted = useSyncExternalStore(subscribeNever, snapTrue, snapFalse)

  // Signed in or not decides what "Follow" does: follow right away, or first
  // get an account. Read once on mount; the cookie refresh in proxy.ts skips
  // /follow, so this is the page's own look at the session.
  const [session, setSession] = useState<'unknown' | 'anon' | 'signed-in'>('unknown')
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session ? 'signed-in' : 'anon'))
  }, [sb])

  // Coming back from the magic link with a follow still pending for THIS
  // link: finish it now and go to the journey. The pending record is cleared
  // whatever happens, so a dead link cannot loop.
  const [pendingFailed, setPendingFailed] = useState(false)
  const pendingRan = useRef(false)
  useEffect(() => {
    if (session !== 'signed-in' || pendingRan.current) return
    // Two ways the choice survives the sign-in round trip: localStorage
    // (same browser) and the ?auto= the magic link's redirect carries (any
    // browser — the email may open somewhere else entirely). Either wins.
    const pending = readPendingFollow()
    const auto = new URLSearchParams(window.location.search).get('auto')
    let travellers: string[] | null | undefined
    if (pending && pending.token === token) travellers = pending.travellers
    else if (auto) travellers = auto === 'all' ? null : auto.split(',').filter((id) => UUID_RE.test(id))
    if (travellers === undefined) return
    pendingRan.current = true
    clearPendingFollow()
    followByToken(sb, token, travellers)
      .then((r) => {
        if (r) {
          qc.invalidateQueries({ queryKey: tk.following })
          router.replace(`/journeys/${r.trip_id}`)
        } else setPendingFailed(true)
      })
      .catch(() => setPendingFailed(true))
  }, [session, sb, token, qc, router])

  const summary = useQuery({
    queryKey: ['shared-summary', token],
    queryFn: () => fetchSharedSummary(sb, token),
    initialData: initialSummary,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000, // route/dates change rarely; also picks up revocation
  })
  const feed = useQuery({
    queryKey: ['shared-feed', token],
    queryFn: () => fetchSharedFeed(sb, token),
    enabled: !!summary.data,
    refetchInterval: 45_000, // the plan's 30-60s polling window
  })
  // Comment counts for the rows (migration 34). Fails soft: a link page on a
  // database without 34 still renders the feed, just without the counts.
  const feedIds = useMemo(() => (feed.data ?? []).map((e) => e.id), [feed.data])
  const social = useQuery({
    queryKey: ['shared-feed-social', token, feedIds.join(',')],
    queryFn: () => fetchSharedFeedSocial(sb, token, feedIds),
    enabled: feedIds.length > 0,
    refetchInterval: 45_000,
    retry: false,
  })
  const commentCount = useMemo(() => new Map((social.data ?? []).map((r) => [r.event_id, r.commentCount])), [social.data])

  // Realtime nudge (migration 18). The ping carries NOTHING — it just says
  // "re-read", and the sanitized RPCs stay the only data path. Polling above is
  // deliberately kept as the floor: if the socket is down, blocked by a captive
  // portal, or the topic is stale after a resume, the page still catches up.
  const topic = summary.data?.broadcastTopic
  useEffect(() => {
    if (!topic) return
    const channel = sb.channel(topic)
    channel
      .on('broadcast', { event: 'trip_update' }, () => {
        qc.invalidateQueries({ queryKey: ['shared-feed', token] })
        qc.invalidateQueries({ queryKey: ['shared-summary', token] })
      })
      .subscribe()
    return () => {
      sb.removeChannel(channel)
    }
  }, [sb, qc, topic, token])

  const s = summary.data
  if (!s) {
    return (
      <Shell>
        <div className="mt-16 text-center">
          <Compass size={40} strokeWidth={2} className="mx-auto text-ac2" aria-hidden />
          <h1 className="mt-4 font-serif text-2xl font-semibold">This link isn’t active</h1>
          <p className="mx-auto mt-2 max-w-xs text-base leading-[1.55] text-tx2">
            It may have been revoked or expired. Ask the traveller for a fresh link.
          </p>
        </div>
      </Shell>
    )
  }

  // Owner paused all sharing: keep the trip title for context, reveal nothing
  // else ("Sharing paused" state). Notification opt-ins are retained
  // server-side and un-mute automatically when sharing resumes.
  if (s.paused) {
    return (
      <Shell>
        <header className="mb-4">
          <div className={kicker}>Following</div>
          <h1 className="mt-1 font-serif text-[27px] font-semibold leading-[1.15] tracking-[-.01em]">{s.tripName}</h1>
        </header>
        <section className={`${card} p-6 text-center`}>
          <CirclePause size={36} strokeWidth={2} className="mx-auto text-ac2" aria-hidden />
          <h2 className="mt-3 font-serif text-xl font-semibold">Sharing is paused</h2>
          <p className="mx-auto mt-2 max-w-sm text-base leading-[1.55] text-tx2">
            The travellers have paused sharing for a while — nothing is wrong, people sometimes
            go off-grid on purpose. This page fills up again the moment sharing resumes, and
            your notification settings are kept.
          </p>
          <p className="mt-3 text-base text-tx3">This page checks again automatically</p>
        </section>
      </Shell>
    )
  }

  const today = mounted ? localISODate() : s.startDate // pre-mount: stable SSR value
  const phase: 'pre' | 'live' | 'post' =
    today < s.startDate ? 'pre' : s.endDate && today > s.endDate ? 'post' : 'live'
  const current = s.route.find((r) => r.arrive <= today && today < r.depart) ?? null
  const events = (feed.data ?? []) as SharedEvent[]
  const latest = events[0]
  const quietDays = latest && mounted ? nightsBetween(latest.occurred_at.slice(0, 10), today) : null
  const dayNum = nightsBetween(s.startDate, today) + 1
  const totalDays = s.endDate ? nightsBetween(s.startDate, s.endDate) + 1 : null
  const lastSeenCity =
    events.find((e) => e.kind === 'arrived')?.payload.city ?? current?.city ?? null

  return (
    <Shell>
      {/* header (frame 30: mauve eyebrow, serif title, tag day pill) */}
      <header className="mb-4">
        <div className={kicker}>Following</div>
        <h1 className="mt-1 font-serif text-[27px] font-semibold leading-[1.15] tracking-[-.01em]">{s.tripName}</h1>
        {s.travellers.length > 0 && (
          <p className="mt-1 text-base text-tx2">{s.travellers.map((t) => t.name).join(' & ')}</p>
        )}
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

      {s.travellers.length > 0 && session !== 'unknown' && (
        <FollowCard
          token={token}
          travellers={s.travellers}
          signedIn={session === 'signed-in'}
          pendingFailed={pendingFailed}
        />
      )}

      {phase === 'pre' ? (
        <section className={`${card} p-6 text-center`}>
          <div className="font-serif text-5xl font-semibold text-ac">
            {nightsBetween(today, s.startDate)}
          </div>
          <div className="mt-1 text-base text-tx2">days until departure · {s.startDate}</div>
          {s.route.length > 0 && (
            <p className="mt-4 text-base leading-[1.55] text-tx2">
              Planned route: {s.route.map((r) => r.city).join(' → ')}
            </p>
          )}
          <p className="mt-3 text-base text-tx3">
            This page turns into the live feed the day the trip starts. Bookmark it!
          </p>
          {/* followers can arm notifications BEFORE departure */}
          <div className="mt-4 text-left">
            <NotifyCard sb={sb} token={token} />
            <DigestCard token={token} />
          </div>
        </section>
      ) : (
        <>
          {/* globe */}
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
                <span className="ml-auto text-tx3">drag to spin · pinch or scroll to zoom</span>
              </p>
            </>
          )}

          {/* current stop */}
          {current && (
            <section className={`${card} mt-3 p-4`}>
              <div className="text-base font-medium uppercase tracking-[.12em] text-ac2-deep">Now in</div>
              <div className="mt-0.5 text-[17px] font-semibold">
                {current.city}, {current.country}
              </div>
              <div className="text-base text-tx2">
                {current.arrive} → {current.depart}
              </div>
            </section>
          )}

          <NotifyCard sb={sb} token={token} />
          <DigestCard token={token} />

          {/* quiet period */}
          {phase === 'live' && quietDays !== null && quietDays >= 3 && (
            <p className="mt-3 rounded-[var(--r)] bg-tag p-4 text-center text-base leading-[1.55] text-tag-ink">
              Quiet days on the road — no updates in {quietDays} days. No news is usually good news.
            </p>
          )}

          {/* feed */}
          <section className="mt-5">
            <h2 className="mb-2 text-base font-semibold uppercase tracking-[.12em] text-ac2-deep">
              Updates
            </h2>
            {feed.isPending && <p className="text-base text-tx2">Loading updates…</p>}
            {!feed.isPending && !events.length && (
              <p className="text-base text-tx2">
                {phase === 'post' ? 'The journal has ended — thanks for following along!' : 'No updates yet — check back soon.'}
              </p>
            )}
            {events.length > 0 && (
              <ul className={`${card} px-3.5`}>
                {events.map((e) => (
                  <SocialRow
                    key={e.id}
                    e={e}
                    href={`/follow/${token}/post/${e.id}`}
                    byline={e.authorName}
                    social={{ commentCount: commentCount.get(e.id) ?? 0 }}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {session === 'anon' && s.travellers.length > 0 && (
        <section className={`${card} mt-5 p-4`}>
          <div className="text-base font-semibold">Follow {s.travellers.map((t) => t.name).join(' and ')} with an account</div>
          <p className="mt-0.5 text-base leading-[1.5] text-tx2">
            Their trips gather on one Home, and you can react and comment.
          </p>
          <p className="mt-2 text-base font-semibold text-ac2">
            <Link href={`/login?next=${encodeURIComponent(`/follow/${token}`)}`}>Create an account</Link>
            <span className="font-normal text-tx3"> · </span>
            <Link href={`/login?next=${encodeURIComponent(`/follow/${token}`)}`}>Sign in</Link>
          </p>
        </section>
      )}

      {/* Footer: the mark only. The old "what you can see here" card named what
          the page withholds (money, exact locations, private notes), which reads
          as a map of where to dig — issue #19. */}
      <footer className="mt-8 space-y-4">
        <p className="flex items-center justify-center gap-2 text-base text-tx3">
          <Image src="/brand/livhold-mark.png" alt="" width={20} height={20} aria-hidden />
          <span className="font-serif font-semibold tracking-[.08em]">LIVHOLD</span>
        </p>
      </footer>
    </Shell>
  )
}

// ?auto= is attacker-typeable; anything that is not a uuid would only turn
// into a Postgres cast error dressed up as "the link may have expired".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const subscribeNever = () => () => {}
const snapTrue = () => true
const snapFalse = () => false

function Shell({ children }: { children: React.ReactNode }) {
  // Phone-first narrow column on the honeydew page wash, same on desktop.
  return (
    <div className="min-h-dvh bg-pg text-tx">
      <main className="lv-enter mx-auto max-w-xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}

// Email fallback: daily/weekly digest — the answer for iOS browser
// tabs (no push without A2HS) and for family who just prefer email. Double
// opt-in runs in the `digest` Edge Function.
function DigestCard({ token }: { token: string }) {
  const [email, setEmail] = useState('')
  const [freq, setFreq] = useState<'daily' | 'weekly'>('daily')
  const [status, setStatus] = useState<'idle' | 'busy' | 'sent' | 'updated' | 'error'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('busy')
    try {
      const r = await subscribeDigest(token, email, freq)
      setStatus(r === 'updated' ? 'updated' : 'sent')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent' || status === 'updated') {
    return (
      <section className={`${card} mt-3 p-4`}>
        <p className="text-base leading-[1.55]">
          {status === 'sent'
            ? <>Almost there — open the email we just sent to <strong>{email}</strong> and tap the confirmation link.</>
            : <>Done — <strong>{email}</strong> now gets a <strong>{freq}</strong> summary.</>}
        </p>
      </section>
    )
  }

  return (
    <section className={`${card} mt-3 p-4`}>
      <div className="flex items-start gap-3">
        <Mail size={22} strokeWidth={2} className="mt-0.5 flex-none text-ac2" aria-hidden />
        <div className="min-w-0 grow">
          <div className="font-serif text-lg font-semibold">Prefer email?</div>
          <p className="mt-0.5 text-base leading-[1.5] text-tx2">
            Get a summary of new check-ins and photos — no app, no push needed.
          </p>
          <form onSubmit={submit} className="mt-2.5 flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-w-0 grow rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-2.5 text-base"
            />
            <select
              value={freq}
              onChange={(e) => setFreq(e.target.value as 'daily' | 'weekly')}
              className="rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-2.5 text-base"
              aria-label="How often"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <button
              type="submit"
              disabled={status === 'busy'}
              className="rounded-[calc(var(--r)-3px)] bg-ac px-4 py-2.5 text-base font-semibold text-on disabled:opacity-50"
            >
              {status === 'busy' ? '…' : 'Email me updates'}
            </button>
          </form>
          {status === 'error' && (
            <p className="mt-1.5 text-base text-warn">Could not subscribe — check the address and try again.</p>
          )}
          <p className="mt-1.5 text-base text-tx3">
            We&apos;ll send a confirmation first · unsubscribe link in every email
          </p>
        </div>
      </div>
    </section>
  )
}

// "Notify me" card (variant A = enable, B = enabled/manage).
function NotifyCard({ sb, token }: { sb: SupabaseClient; token: string }) {
  const [state, setState] = useState<PushState | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    getPushState().then(setState)
  }, [])

  if (state === 'loading' || state === 'unsupported') return null // dev server / old browsers

  // iOS in a plain browser tab: push only works INSTALLED — show the path
  // instead of hiding (dogfood 2026-07-24: "no option on mobile").
  if (state === 'ios-install') {
    return (
      <section className={`${card} mt-3 p-4`}>
        <div className="flex items-start gap-3">
          <Bell size={22} strokeWidth={2} className="mt-0.5 flex-none text-ac2" aria-hidden />
          <div className="min-w-0 grow">
            <div className="font-serif text-lg font-semibold">Know when they check in</div>
            <p className="mt-0.5 text-base leading-[1.5] text-tx2">
              On iPhone/iPad, notifications need this page on your Home Screen:
            </p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-base leading-[1.5] text-tx2">
              <li>Open this link in <strong className="text-tx">Safari</strong> (if you&apos;re in Messenger/Instagram, tap ⋯ → Open in Safari)</li>
              <li>Tap <strong className="text-tx">Share</strong> <span aria-hidden>⎋</span> → <strong className="text-tx">Add to Home Screen</strong></li>
              <li>Open it from the new icon → tap <strong className="text-tx">Enable push notifications</strong> here</li>
            </ol>
          </div>
        </div>
      </section>
    )
  }

  const toggle = async () => {
    setBusy(true)
    try {
      setState(state === 'subscribed' ? await disablePush(sb, token) : await enablePush(sb, token))
    } catch {
      setState(await getPushState())
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`${card} mt-3 p-4`}>
      <div className="flex items-start gap-3">
        <Bell size={22} strokeWidth={2} className="mt-0.5 flex-none text-ac2" aria-hidden />
        <div className="min-w-0 grow">
          <div className="font-serif text-lg font-semibold">Know when they check in</div>
          <p className="mt-0.5 text-base leading-[1.5] text-tx2">
            {state === 'subscribed'
              ? 'Notifications are on for this device.'
              : 'Get a ping the moment something new is shared — check-ins, arrivals, notes. Nothing else, no marketing.'}
          </p>
          {state === 'denied' ? (
            <p className="mt-2 text-base text-tx3">
              Notifications are blocked for this site — enable them in your browser settings to opt in.
            </p>
          ) : (
            <button
              onClick={toggle}
              disabled={busy}
              className={
                state === 'subscribed'
                  ? 'mt-2.5 rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln3 px-4 py-2.5 text-base font-semibold text-tx2 disabled:opacity-50'
                  : 'mt-2.5 rounded-[calc(var(--r)-3px)] bg-ac px-4 py-2.5 text-base font-semibold text-on disabled:opacity-50'
              }
            >
              {busy ? '…' : state === 'subscribed' ? 'Turn off notifications' : 'Enable push notifications'}
            </button>
          )}
          <p className="mt-1.5 text-base text-tx3">
            Browser notifications on this device · no account needed
          </p>
        </div>
      </div>
    </section>
  )
}

// The one card that turns a link into a relationship. Everyone on the trip is
// preselected; untick a name to keep only the others. Signed in, Follow does it
// now and opens the journey. Anonymous, Follow first asks for an account —
// the selection is remembered across the magic-link round trip.
function FollowCard({
  token, travellers, signedIn, pendingFailed,
}: { token: string; travellers: Traveller[]; signedIn: boolean; pendingFailed: boolean }) {
  const sb = createClient()
  const qc = useQueryClient()
  const router = useRouter()
  const [picked, setPicked] = useState<Set<string>>(() => new Set(travellers.map((t) => t.id)))
  const [sheet, setSheet] = useState(false)
  const chosen = travellers.filter((t) => picked.has(t.id))
  const all = chosen.length === travellers.length

  const follow = useMutation({
    mutationFn: () => followByToken(sb, token, all ? null : chosen.map((t) => t.id)),
    onSuccess: (r) => {
      if (!r) return
      qc.invalidateQueries({ queryKey: tk.following })
      router.push(`/journeys/${r.trip_id}`)
    },
  })
  const dead = follow.isSuccess && follow.data === null

  const toggle = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const label = chosen.length === 0 ? 'Pick someone to follow' : `Follow ${chosen.map((t) => t.name).join(' & ')}`

  return (
    <section className={`${card} mb-4 p-4`}>
      <div className="flex items-start gap-3">
        <UserPlus size={22} strokeWidth={2} className="mt-0.5 flex-none text-ac2" aria-hidden />
        <div className="min-w-0 grow">
          <div className="font-serif text-lg font-semibold">Follow the travellers</div>
          <p className="mt-0.5 text-base leading-[1.5] text-tx2">
            Their check-ins land on your Home, on this trip and the next.
          </p>
          {travellers.length > 1 && (
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {travellers.map((t) => {
                const on = picked.has(t.id)
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      aria-pressed={on}
                      className={
                        'rounded-full px-3 py-1.5 text-base font-medium ' +
                        (on ? 'bg-ac2-soft text-ac2-deep' : 'border-[1.4px] border-ln3 text-tx2')
                      }
                    >
                      {on ? '✓ ' : ''}{t.name}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <button
            type="button"
            disabled={chosen.length === 0 || follow.isPending}
            onClick={() => (signedIn ? follow.mutate() : setSheet(true))}
            className="mt-2.5 w-full rounded-[calc(var(--r)-3px)] bg-ac px-4 py-2.5 text-base font-semibold text-on disabled:opacity-50"
          >
            {follow.isPending ? 'Following…' : label}
          </button>
          {(dead || pendingFailed || follow.isError) && (
            <p className="mt-1.5 text-base text-warn">
              That did not work — the link may have expired, or the travellers paused it. Ask them for a fresh one.
            </p>
          )}
        </div>
      </div>
      {sheet && (
        <AccountSheet
          token={token}
          travellers={all ? null : chosen.map((t) => t.id)}
          names={chosen.map((t) => t.name)}
          onClose={() => setSheet(false)}
        />
      )}
    </section>
  )
}

// Magic-link sign-in that comes back HERE. The pending follow is saved before
// the email goes out, so the return trip finishes it without a second tap.
function AccountSheet({
  token, travellers, names, onClose,
}: { token: string; travellers: string[] | null; names: string[]; onClose: () => void }) {
  const sb = createClient()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('busy')
    savePendingFollow(token, travellers)
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // The redirect carries the choice too, so a link opened in another
        // browser (no localStorage) still finishes the follow on arrival.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/follow/${token}?auto=${travellers ? travellers.join(',') : 'all'}`)}`,
      },
    })
    if (error) {
      setError(error.message)
      setStatus('error')
    } else setStatus('sent')
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-tx/45"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Get an account"
        className="lv-sheet fixed inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col gap-[13px] overflow-y-auto rounded-t-[var(--r)] bg-sf px-[18px] pb-[max(26px,env(safe-area-inset-bottom))] pt-2.5 text-tx"
      >
        <div aria-hidden className="mx-auto h-[5px] w-11 flex-none rounded-full bg-ln3" />
        <h2 className="font-serif text-[21px] font-semibold">Follow {names.join(' & ')}</h2>
        {status === 'sent' ? (
          <p className="text-base leading-[1.55]">
            Check <strong>{email}</strong> and tap the link in the email. It brings you back here, already following.
          </p>
        ) : (
          <>
            <p className="-mt-2 text-base leading-[1.5] text-tx2">
              Following needs an account, so their trips can find you. One email, no password.
            </p>
            <form onSubmit={submit} className="flex flex-col gap-2.5">
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base outline-none focus:border-ac"
              />
              <button
                type="submit"
                disabled={status === 'busy'}
                className="rounded-[calc(var(--r)-3px)] bg-ac py-3 text-base font-semibold text-on disabled:opacity-50"
              >
                {status === 'busy' ? '…' : 'Email me a sign-in link'}
              </button>
              {status === 'error' && <p className="text-base text-warn">{error || 'Could not send the email — try again.'}</p>}
            </form>
            <p className="text-[13px] leading-[1.5] text-tx3">
              Already have an account? The same link signs you in.
            </p>
          </>
        )}
        <button type="button" onClick={onClose} className="rounded-[var(--rCtl)] border-[1.5px] border-ln2 bg-sf py-3 text-base font-medium">
          {status === 'sent' ? 'Done' : 'Not now'}
        </button>
      </div>
    </div>
  )
}
