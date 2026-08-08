'use client'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LucideIcon } from 'lucide-react'
import {
  Bell, CirclePause, Compass, Dot, Image as ImageIcon, Mail, MapPin,
  NotebookPen, PlaneLanding, RadioTower,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchSharedFeed, fetchSharedSummary, followMediaUrl, subscribeDigest, type SharedEvent, type SharedSummary } from '@/lib/follow/api'
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/follow/push'
import { nightsBetween } from '@/lib/trips/format'

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

// mauve = people/memories accents (handoff color semantics)
const EVENT_ICON: Record<string, LucideIcon> = {
  checkin: MapPin, note: NotebookPen, arrived: PlaneLanding, media: ImageIcon, location: RadioTower,
}

const kicker = 'text-base font-medium uppercase tracking-[.14em] text-ac2-deep'
const card = 'rounded-[var(--r)] bg-sf'

function localISODate(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60_000))
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function Stars({ n }: { n: number }) {
  return <span className="text-warn">{'★'.repeat(n)}<span className="text-ln3">{'★'.repeat(5 - n)}</span></span>
}

export default function FollowClient({
  token, initialSummary,
}: { token: string; initialSummary: SharedSummary | null }) {
  const sb = createClient()
  const qc = useQueryClient()

  // "today" is clock-dependent → compute after mount (SSR/hydration safety).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

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
  const quietDays = latest
    ? Math.floor((Date.now() - +new Date(latest.occurred_at)) / 86_400_000)
    : null
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
            <ul className="space-y-2">
              {events.map((e) => {
                const Icon = EVENT_ICON[e.kind] ?? Dot
                return (
                  <li key={e.id} className={`${card} p-4`}>
                    <div className="flex items-start gap-2.5">
                      <Icon size={18} strokeWidth={2} className="mt-1 flex-none text-ac2" aria-hidden />
                      <div className="min-w-0 grow">
                        {e.kind === 'checkin' && (
                          <span className="text-[17px] font-semibold">{e.payload.placeName ?? 'Checked in'}</span>
                        )}
                        {e.kind === 'arrived' && (
                          <span className="text-[17px] font-semibold">Arrived in {e.payload.city}</span>
                        )}
                        {e.kind === 'note' && <span className="text-base">{e.payload.text}</span>}
                        {e.rating != null && (
                          <span className="ml-2 text-base"><Stars n={e.rating} /></span>
                        )}
                        {e.comment && (
                          <p className="mt-1 text-base leading-[1.55] text-tx2">{e.comment}</p>
                        )}
                        {!!e.payload.photos?.length && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {e.payload.photos.map((p) => (
                              <a key={p} href={followMediaUrl(p)} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={followMediaUrl(p)} alt="" loading="lazy" className="h-24 w-24 rounded-[12px] object-cover" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-base text-tx3">{timeAgo(e.occurred_at)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}

      {/* transparency footer (frame 30's tag-wash privacy note, follower-facing) */}
      <footer className="mt-8 space-y-4">
        <div className="rounded-[var(--r)] bg-tag p-4 text-base leading-[1.55] text-tag-ink">
          <p className="font-medium">What you can see here</p>
          <p className="mt-1">
            Route cities &amp; dates, check-ins and notes the travellers chose to share. Money,
            bookings, exact locations and private notes are never part of this page.
          </p>
        </div>
        <p className="flex items-center justify-center gap-2 text-base text-tx3">
          <Image src="/brand/livhold-mark.png" alt="" width={20} height={20} aria-hidden />
          <span className="font-serif font-semibold tracking-[.08em]">LIVHOLD</span>
        </p>
      </footer>
    </Shell>
  )
}

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
