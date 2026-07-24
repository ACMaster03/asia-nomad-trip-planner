'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { fetchSharedFeed, fetchSharedSummary, followMediaUrl, subscribeDigest, type SharedEvent, type SharedSummary } from '@/lib/follow/api'
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/follow/push'
import { nightsBetween } from '@/lib/trips/format'

// /follow/[token] — the no-account family view (approved endframe: mock 07).
// States: invalid link · pre-trip countdown · live (globe + current stop +
// feed, polled ~45s — Postgres Changes can't reach anon under closed RLS) ·
// post-trip. Everything rendered here comes from the sanitized RPCs; there is
// nothing more to find in dev-tools than what this page shows.

const FollowGlobe = dynamic(() => import('@/components/follow/FollowGlobe'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">Loading globe…</div>
  ),
})

const EVENT_ICON: Record<string, string> = {
  checkin: '📍', note: '📝', arrived: '🛬', media: '🖼️', location: '📡',
}

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
  return <span className="text-amber-500">{'★'.repeat(n)}<span className="text-neutral-300 dark:text-neutral-700">{'★'.repeat(5 - n)}</span></span>
}

export default function FollowClient({
  token, initialSummary,
}: { token: string; initialSummary: SharedSummary | null }) {
  const sb = createClient()

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

  const s = summary.data
  if (!s) {
    return (
      <Shell>
        <div className="mt-16 text-center">
          <div className="text-4xl">🧭</div>
          <h1 className="mt-3 text-xl font-semibold">This link isn’t active</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-neutral-500">
            It may have been revoked or expired. Ask the traveller for a fresh link.
          </p>
        </div>
      </Shell>
    )
  }

  // Owner paused all sharing: keep the trip title for context, reveal nothing
  // else (mock 07 "Sharing paused" state). Notification opt-ins are retained
  // server-side and un-mute automatically when sharing resumes.
  if (s.paused) {
    return (
      <Shell>
        <header className="mb-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Following</div>
          <h1 className="text-2xl font-semibold">{s.tripName}</h1>
        </header>
        <section className="rounded-xl border border-neutral-200 p-6 text-center dark:border-neutral-800">
          <div className="text-4xl" aria-hidden>⏸️</div>
          <h2 className="mt-3 text-lg font-semibold">Sharing is paused</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
            The travellers have paused sharing for a while — nothing is wrong, people sometimes
            go off-grid on purpose. This page fills up again the moment sharing resumes, and
            your notification settings are kept.
          </p>
          <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-600">⟳ This page checks again automatically</p>
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
      {/* header */}
      <header className="mb-4">
        <div className="text-xs uppercase tracking-wide text-neutral-500">
          {phase === 'pre' && 'Departure countdown'}
          {phase === 'live' && (totalDays ? `Day ${dayNum} of ${totalDays}` : `Day ${dayNum}`)}
          {phase === 'post' && 'Trip complete'}
        </div>
        <h1 className="text-2xl font-semibold">{s.tripName}</h1>
        {phase === 'live' && lastSeenCity && latest && (
          <p className="mt-1 text-sm text-neutral-500">
            Last seen: <span className="font-medium text-neutral-700 dark:text-neutral-300">{lastSeenCity}</span> · {timeAgo(latest.occurred_at)}
          </p>
        )}
      </header>

      {phase === 'pre' ? (
        <section className="rounded-xl border border-neutral-200 p-6 text-center dark:border-neutral-800">
          <div className="text-5xl font-semibold text-teal-600">
            {nightsBetween(today, s.startDate)}
          </div>
          <div className="mt-1 text-sm text-neutral-500">days until departure · {s.startDate}</div>
          {s.route.length > 0 && (
            <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
              Planned route: {s.route.map((r) => r.city).join(' → ')}
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            This page turns into the live feed the day the trip starts. Bookmark it!
          </p>
          {/* mock 07: followers can arm notifications BEFORE departure */}
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
              <section className="h-72 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
                <FollowGlobe
                  route={s.route}
                  currentCity={current?.city ?? null}
                  todayISO={today}
                  lastSeenCity={lastSeenCity}
                  stale={quietDays !== null && quietDays >= 3}
                />
              </section>
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-[11px] text-neutral-400 dark:text-neutral-600">
                <span><span className="text-teal-600">●</span> visited</span>
                <span><span className="text-amber-500">◉</span> last seen</span>
                <span><span className="text-slate-400">○</span> upcoming</span>
                <span className="ml-auto">drag to spin · pinch or scroll to zoom</span>
              </p>
            </>
          )}

          {/* current stop */}
          {current && (
            <section className="mt-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Now in</div>
              <div className="text-lg font-semibold">
                {current.city}, {current.country}
              </div>
              <div className="text-sm text-neutral-500">
                {current.arrive} → {current.depart}
              </div>
            </section>
          )}

          <NotifyCard sb={sb} token={token} />
          <DigestCard token={token} />

          {/* quiet period */}
          {phase === 'live' && quietDays !== null && quietDays >= 3 && (
            <p className="mt-3 rounded-lg bg-neutral-100 p-3 text-center text-sm text-neutral-500 dark:bg-neutral-900">
              🌴 Quiet days on the road — no updates in {quietDays} days. No news is usually good news.
            </p>
          )}

          {/* feed */}
          <section className="mt-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Updates
            </h2>
            {feed.isPending && <p className="text-sm text-neutral-500">Loading updates…</p>}
            {!feed.isPending && !events.length && (
              <p className="text-sm text-neutral-500">
                {phase === 'post' ? 'The journal has ended — thanks for following along!' : 'No updates yet — check back soon.'}
              </p>
            )}
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                  <div className="flex items-baseline gap-2">
                    <span aria-hidden>{EVENT_ICON[e.kind] ?? '•'}</span>
                    <div className="min-w-0 grow">
                      {e.kind === 'checkin' && (
                        <span className="text-sm font-medium">{e.payload.placeName ?? 'Checked in'}</span>
                      )}
                      {e.kind === 'arrived' && (
                        <span className="text-sm font-medium">Arrived in {e.payload.city}</span>
                      )}
                      {e.kind === 'note' && <span className="text-sm">{e.payload.text}</span>}
                      {e.rating != null && (
                        <span className="ml-2 text-xs"><Stars n={e.rating} /></span>
                      )}
                      {e.comment && (
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{e.comment}</p>
                      )}
                      {!!e.payload.photos?.length && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {e.payload.photos.map((p) => (
                            <a key={p} href={followMediaUrl(p)} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={followMediaUrl(p)} alt="" loading="lazy" className="h-24 w-24 rounded-lg object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-neutral-500">{timeAgo(e.occurred_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* transparency footer (mock 09's privacy grid, follower-facing) */}
      <footer className="mt-8 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
        <p className="font-medium">What you can see here</p>
        <p className="mt-1">
          Route cities &amp; dates, check-ins and notes the travellers chose to share. Money,
          bookings, exact locations and private notes are never part of this page.
        </p>
        <p className="mt-3">🧭 Asia Nomad Planner</p>
      </footer>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  // Phone-first narrow column, same on desktop (mock 07).
  return <main className="mx-auto max-w-xl p-4 sm:p-6">{children}</main>
}

// Mock 07 email fallback: daily/weekly digest — the answer for iOS browser
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
      <section className="mt-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm">
          {status === 'sent'
            ? <>📬 Almost there — open the email we just sent to <strong>{email}</strong> and tap the confirmation link.</>
            : <>✅ Done — <strong>{email}</strong> now gets a <strong>{freq}</strong> summary.</>}
        </p>
      </section>
    )
  }

  return (
    <section className="mt-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>📮</span>
        <div className="min-w-0 grow">
          <div className="font-medium">Prefer email?</div>
          <p className="mt-0.5 text-sm text-neutral-500">
            Get a summary of new check-ins and photos — no app, no push needed.
          </p>
          <form onSubmit={submit} className="mt-2 flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-w-0 grow rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <select
              value={freq}
              onChange={(e) => setFreq(e.target.value as 'daily' | 'weekly')}
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              aria-label="How often"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <button
              type="submit"
              disabled={status === 'busy'}
              className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {status === 'busy' ? '…' : 'Email me updates'}
            </button>
          </form>
          {status === 'error' && (
            <p className="mt-1.5 text-xs text-red-600">Could not subscribe — check the address and try again.</p>
          )}
          <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-600">
            We&apos;ll send a confirmation first · unsubscribe link in every email
          </p>
        </div>
      </div>
    </section>
  )
}

// Mock 07 "Notify me" card (variant A = enable, B = enabled/manage).
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
      <section className="mt-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>🔔</span>
          <div className="min-w-0 grow">
            <div className="font-medium">Know when they check in</div>
            <p className="mt-0.5 text-sm text-neutral-500">
              On iPhone/iPad, notifications need this page on your Home Screen:
            </p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
              <li>Open this link in <strong>Safari</strong> (if you&apos;re in Messenger/Instagram, tap ⋯ → Open in Safari)</li>
              <li>Tap <strong>Share</strong> <span aria-hidden>⎋</span> → <strong>Add to Home Screen</strong></li>
              <li>Open it from the new icon → tap <strong>Enable push notifications</strong> here</li>
            </ol>
          </div>
        </div>
      </section>
    )
  }

  const toggle = async () => {
    setBusy(true)
    try {
      setState(state === 'subscribed' ? await disablePush(sb) : await enablePush(sb, token))
    } catch {
      setState(await getPushState())
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>🔔</span>
        <div className="min-w-0 grow">
          <div className="font-medium">Know when they check in</div>
          <p className="mt-0.5 text-sm text-neutral-500">
            {state === 'subscribed'
              ? 'Notifications are on for this device.'
              : 'Get a ping the moment something new is shared — check-ins, arrivals, notes. Nothing else, no marketing.'}
          </p>
          {state === 'denied' ? (
            <p className="mt-2 text-xs text-neutral-500">
              Notifications are blocked for this site — enable them in your browser settings to opt in.
            </p>
          ) : (
            <button
              onClick={toggle}
              disabled={busy}
              className={
                state === 'subscribed'
                  ? 'mt-2 rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700'
                  : 'mt-2 rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50'
              }
            >
              {busy ? '…' : state === 'subscribed' ? 'Turn off notifications' : 'Enable push notifications'}
            </button>
          )}
          <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-600">
            Browser notifications on this device · no account needed
          </p>
        </div>
      </div>
    </section>
  )
}
