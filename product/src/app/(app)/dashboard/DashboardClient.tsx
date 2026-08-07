'use client'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { MapPin, PlaneLanding, TriangleAlert, SatelliteDish, X, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { computeBudget } from '@/lib/trips/budget'
import { tripPhase } from '@/lib/trips/recap'
import { tripRecap } from '@/lib/trips/recap'
import { fetchTripEvents, type TripEvent } from '@/lib/trips/events'
import { tk } from '@/lib/trips/keys'
import { useTripScope } from '@/lib/trips/TripScope'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { BeforeYouFly, ComingUp } from '../reminders/HomeReminders'

// Home — the one phase-aware tab (handoff frames 07–10). The trip phase
// (pre / arrive / live / off-plan / post) decides the whole layout:
//   pre    → next-stop hero + countdown tiles + estimated total
//   live   → live hero + check-in + trip strip + money + feed
//   arrive → live layout, no hero progress, extra "Arrived" affordance (/live)
//   off    → live layout with the drift card (detected from the latest
//            check-in naming a place that isn't the planned stop)
//   post   → recap wash + stats + forward cards
// Reminders (frames 25–26) mount in two reserved slots via HomeReminders:
// "Before you fly" pre-trip (above Estimated total) and "Coming up" while
// live/arrive/off (between the check-in button and the trip strip).

const card = 'rounded-[var(--r)] bg-sf p-4 text-tx'
const kicker = 'text-base font-semibold uppercase tracking-[.12em] text-ac2-deep'

function fmtDay(d: Date, withYear = false) {
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

export default function DashboardClient({
  userEmail,
  userName,
}: {
  userEmail?: string
  userName?: string
}) {
  const sb = createClient()
  const { fmt } = useMoney()
  const { tripId } = useTripScope()
  const { trip, cityIdx } = useTripScreen()
  // Clock-dependent → client-only (SSR snapshot renders the pre layout, same
  // hydration rule the old dashboard followed, minus the setState-in-effect).
  const mounted = useSyncExternalStore(subscribeNever, snapTrue, snapFalse)
  const [driftDismissed, setDriftDismissed] = useState(false)
  const offline = !useSyncExternalStore(subscribeOnline, snapOnline, snapTrue)
  const [offlineDismissed, setOfflineDismissed] = useState(false)

  const events = useQuery({
    queryKey: tk.events(tripId ?? 'none'),
    queryFn: () => fetchTripEvents(sb, tripId!, 8),
    enabled: tripId !== null,
  })

  const b = useMemo(
    () => (trip.data ? computeBudget(trip.data.state, cityIdx) : null),
    [trip.data, cityIdx],
  )

  // Everything below tolerates missing data — hooks (useScrollReset) must run
  // on every render, including the loading ones, so derivation happens BEFORE
  // the early returns.
  const s = trip.data?.state
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const basePhase = mounted && s ? tripPhase(s, todayIso) : 'pre'
  const inPlan = s ? s.segments.filter((x) => x.include !== false) : []
  const sorted = inPlan.slice().sort((a, c) => a.arrive.localeCompare(c.arrive))
  const current = sorted.find((seg) => seg.arrive <= todayIso && todayIso <= seg.depart)
  const nextStop = sorted.find((seg) => seg.arrive > todayIso)
  const stopNo = current ? sorted.indexOf(current) + 1 : 0
  const isArrive = basePhase === 'live' && current?.arrive === todayIso

  // Off-plan: the latest check-in (≤48h old) names a place outside the
  // planned stop's city. Coarse on purpose — the rig's GPS drift is Phase 7.
  const latestCheckin = events.data?.find((e) => e.kind === 'checkin')
  const placeName = (latestCheckin?.payload?.placeName as string | undefined) ?? ''
  const isOff =
    basePhase === 'live' &&
    !isArrive &&
    !!current &&
    !!latestCheckin &&
    +today - +new Date(latestCheckin.occurred_at) < 48 * 3600_000 &&
    !!placeName &&
    !placeName.toLowerCase().includes(current.city.toLowerCase())

  const phase = basePhase === 'live' ? (isArrive ? 'arrive' : isOff && !driftDismissed ? 'off' : 'live') : basePhase

  // Phase changes reset scroll (handoff rule).
  useScrollReset(phase)

  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data || !s || !b) return <CreateTripEmptyState />

  // The saved first name (Account → Your name) wins over the email initial.
  const initial = (userName?.trim()[0] ?? userEmail?.trim()[0] ?? '?').toUpperCase()
  const header = (eyebrow: string, title: string, sub: string) => (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-base font-medium uppercase tracking-[.14em] text-ac2-deep">{eyebrow}</div>
        <h1 className="mt-1 font-serif text-[28px] font-semibold leading-[1.12] tracking-[-.01em]">{title}</h1>
        <p className="mt-[5px] text-base text-tx2">{sub}</p>
      </div>
      <Link
        href="/account"
        aria-label="Account"
        title={userName || userEmail || 'Account'}
        className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-ac2-soft text-[17px] font-semibold text-ac2-deep"
      >
        {initial}
      </Link>
    </div>
  )

  /* ── post-trip (frame 10) ── */
  if (phase === 'post') {
    const recap = tripRecap(s, trip.data.ledger ?? [], events.data?.filter((e) => e.kind === 'checkin').length ?? 0)
    const countries = recap.countries.length
    return (
      <main
        className="flex min-h-dvh flex-col gap-3 px-[18px] pb-6 pt-[18px]"
        style={{ background: 'var(--washLight)', color: 'var(--washInk)' }}
      >
        {header(fmtDay(today, true), 'Home again', `${s.meta.tripName} · complete`)}
        <div className={card + ' lv-enter p-5'}>
          <h2 className="font-serif text-[22px] font-semibold leading-[1.3]">
            {recap.days} nights, {recap.stops} cities, {countries} {countries === 1 ? 'country' : 'countries'}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3.5">
            {(
              [
                ['Check-ins', String(recap.checkIns), true],
                ['Spent', fmt(recap.spent), false],
                ['Vs plan', recap.leftOfCap === null ? '—' : fmt(-recap.leftOfCap), true],
                ['Stops', String(recap.stops), false],
              ] as const
            ).map(([k, v, mauve]) => (
              <div key={k}>
                <div className="text-base font-medium uppercase tracking-[.11em] text-tx2">{k}</div>
                <div className={'text-[26px] font-semibold ' + (mauve ? 'text-ac2' : '')}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <Link href="/money" className={card + ' flex items-center justify-between'}>
          <span>
            <span className="block text-base font-semibold">Final numbers</span>
            <span className="block text-base text-tx2">the full ledger, month by month</span>
          </span>
          <ChevronRight aria-hidden className="size-5 text-ac2" />
        </Link>
        <div className="rounded-[var(--r)] bg-tag px-4 py-3.5 text-base leading-normal text-tag-ink">
          Nothing is archived - Trip, Money and the feed stay as they were. Follow links keep working until they expire.
        </div>
        <div className={kicker}>The feed keeps the memories</div>
        <Link href="/live" className={card + ' flex items-center justify-between'}>
          <span>
            <span className="block text-base font-semibold">All check-ins · {recap.checkIns} so far</span>
            <span className="block text-base text-tx2">every place, photo and note, day by day</span>
          </span>
          <ChevronRight aria-hidden className="size-5 text-ac2" />
        </Link>
      </main>
    )
  }

  /* ── pre-trip (frame 07) ── */
  if (phase === 'pre') {
    const first = sorted[0]
    const daysTo = s.meta.startDate ? Math.max(0, Math.ceil((+new Date(s.meta.startDate) - +today) / 86400000)) : null
    const cap = s.meta.budgetCap || 0
    const pct = cap ? Math.min(100, Math.round((b.grand / cap) * 100)) : null
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px]">
        {header(fmtDay(today), s.meta.tripName, `${inPlan.length} stops · ${b.totalNights} nights · ${s.meta.travelers} travellers`)}
        {first && (
          <div className={card + ' lv-enter p-5'}>
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ac2" />
              <span className="text-base font-semibold uppercase tracking-[.12em] text-ac2">First stop</span>
            </div>
            <div className="mt-2 font-serif text-[33px] font-semibold leading-none tracking-[-.02em]">{first.city}</div>
            <div className="mt-1.5 text-base font-medium text-tx2">
              {first.country} · {Math.max(1, Math.round((+new Date(first.depart) - +new Date(first.arrive)) / 86400000))} nights · from{' '}
              {new Date(first.arrive).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
            </div>
            {daysTo !== null && (
              <div className="mt-3">
                <span className="text-[46px] font-semibold leading-none tracking-[-.03em] text-ac2">{daysTo}</span>{' '}
                <span className="text-lg font-medium text-tx2">days to departure</span>
              </div>
            )}
            <div className="mt-[18px] flex gap-[9px]">
              <Link href="/itinerary" className="flex-1 rounded-[var(--rCtl)] bg-ac py-3.5 text-center text-base font-semibold text-on">
                Open itinerary
              </Link>
              <Link href="/itinerary" className="rounded-[var(--rCtl)] border-[1.5px] border-ac2 px-[18px] py-[13px] text-base font-semibold text-ac2">
                Edit
              </Link>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className={card + ' p-[15px]'}>
            <div className="text-base font-medium uppercase tracking-[.11em] text-tx2">Departure</div>
            <div className="text-[26px] font-semibold text-ac2">{daysTo !== null ? `${daysTo} days` : '—'}</div>
          </div>
          <div className={card + ' p-[15px]'}>
            <div className="text-base font-medium uppercase tracking-[.11em] text-tx2">Trip length</div>
            <div className="text-[26px] font-semibold">{b.totalNights} days</div>
          </div>
        </div>
        <BeforeYouFly state={s} todayIso={todayIso} />
        <div className={card + ' p-5'}>
          <div className="flex items-baseline justify-between">
            <span className="text-base font-medium uppercase tracking-[.11em] text-tx2">Estimated total</span>
            {pct !== null && <span className="text-base font-semibold text-ac2">{pct}%</span>}
          </div>
          <div className="mt-1">
            <span className="text-[30px] font-semibold tracking-[-.02em]">{fmt(b.grand)}</span>
          </div>
          {pct !== null && (
            <>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-track">
                <span className="block h-full rounded-full bg-ac transition-[width] duration-700" style={{ width: pct + '%' }} />
              </div>
              <p className="mt-2 text-base text-tx2">
                of {fmt(cap)} cap · <span className="font-semibold text-ac2-deep">{fmt(Math.max(0, cap - b.grand))} left</span>
              </p>
            </>
          )}
          <div className="mt-3 border-t border-ln pt-3">
            <div className="flex justify-between text-base"><span className="text-tx2">Actually committed</span><span className="font-semibold">{fmt(b.committed)}</span></div>
            <div className="mt-1.5 flex justify-between text-base"><span className="text-tx2">Estimated per day</span><span className="font-semibold">{fmt(b.perDay)}</span></div>
          </div>
          {b.missingAccomStops.length > 0 && (
            <div className="mt-3 flex gap-2 rounded-[var(--rCtl)] bg-warn-soft p-3">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 flex-none text-warn" strokeWidth={2} />
              <p className="text-base leading-snug text-warn">
                {b.missingAccomStops.length} {b.missingAccomStops.length === 1 ? 'stop has' : 'stops have'} no stay yet - the rest of the
                estimate is city averages, not your numbers.
              </p>
            </div>
          )}
        </div>
        <Link href="/knowledge" className={card + ' flex items-center justify-between'}>
          <span>
            <span className="block text-base font-semibold">Explore city costs</span>
            <span className="block text-base text-tx2">averages for every city on the route</span>
          </span>
          <ChevronRight aria-hidden className="size-5 text-ac2" />
        </Link>
      </main>
    )
  }

  /* ── live / arrive / off-plan (frames 08–09, 24) ── */
  const day = s.meta.startDate ? Math.floor((+today - +new Date(s.meta.startDate)) / 86400000) + 1 : null
  const night = current ? Math.max(1, Math.floor((+today - +new Date(current.arrive)) / 86400000)) : null
  const nightsHere = current ? Math.max(1, Math.round((+new Date(current.depart) - +new Date(current.arrive)) / 86400000)) : null
  const stay = current ? s.stays.find((st) => st.segId === current.id && st.include !== false) : undefined
  const recapMid = tripRecap(s, trip.data.ledger ?? [])
  const tripPct = day && b.totalNights ? Math.min(100, Math.round((day / b.totalNights) * 100)) : 0

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-3">
      {header(
        fmtDay(today),
        s.meta.tripName,
        phase === 'off' ? 'off-route detour' : current ? `${current.city}, stop ${stopNo} of ${inPlan.length}` : 'between stops',
      )}

      {offline && !offlineDismissed && (
        <div className="lv-enter flex items-start gap-2.5 rounded-[var(--r)] border-[1.5px] border-warn-line bg-sf p-3.5">
          <SatelliteDish aria-hidden className="mt-0.5 size-4 flex-none text-warn" strokeWidth={2} />
          <p className="flex-1 text-base font-medium leading-normal text-warn">
            You&apos;re offline - check-ins are saved on this phone and will sync when you&apos;re back.
          </p>
          {/* 16px glyph, 44px tap target — negative margins keep the layout
              where the bare icon sat (README: 44px min hit targets). */}
          <button
            aria-label="Dismiss"
            onClick={() => setOfflineDismissed(true)}
            className="-m-3.5 flex size-11 flex-none items-center justify-center"
          >
            <X className="size-4 text-warn" />
          </button>
        </div>
      )}
      {offline && offlineDismissed && (
        <div className="flex items-center gap-1.5 self-center rounded-full bg-warn-soft px-3 py-1 text-base font-medium text-warn">
          <SatelliteDish aria-hidden className="size-3.5" strokeWidth={2} /> Offline · syncs later
        </div>
      )}

      <div className={card + ' lv-enter p-5'}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {phase !== 'off' && <span aria-hidden className="h-2 w-2 rounded-full bg-ac" />}
            <span className={'text-base font-semibold uppercase tracking-[.11em] ' + (phase === 'off' ? 'text-tx2' : 'text-ac')}>
              {phase === 'off' ? 'Right now' : 'On plan'}
            </span>
          </span>
          {day && <span className="text-base font-medium text-tx2">Day {day} of {b.totalNights}</span>}
        </div>
        <div className="mt-2 font-serif text-[30px] font-semibold leading-[1.2] tracking-[-.01em]">
          {phase === 'off' ? `${placeName}` : phase === 'arrive' ? `${current?.city}, arrival day` : current ? `${current.city}, night ${night}` : 'Between stops'}
        </div>
        <div className="mt-1 text-base text-tx2">
          {phase === 'off'
            ? 'Not a stop in the plan · no stay logged'
            : current
              ? `${stay ? `${stay.name || 'Stay'} · booked` : 'not booked'}${phase === 'arrive' ? ` · ${nightsHere} nights planned` : ` · leave ${new Date(current.depart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}`
              : ''}
        </div>
        {phase === 'live' && current && night && nightsHere && (
          <>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-track">
              <span className="block h-full rounded-full bg-ac" style={{ width: Math.min(100, Math.round((night / nightsHere) * 100)) + '%' }} />
            </div>
            <div className="mt-1.5 text-right text-base font-semibold text-ac2">{Math.max(0, nightsHere - night)} nights left</div>
          </>
        )}
        {nextStop && (
          <Link href="/itinerary" className="mt-3 flex items-center justify-between border-t border-ln pt-3">
            <span>
              <span className="block text-base font-semibold">
                Next: {nextStop.city} · {new Date(nextStop.arrive).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
              {b.missingAccomStops.length > 0 && (
                <span className="block text-base text-warn">no stay yet{b.missingAccomStops.length > 1 ? ` - nor for the ${b.missingAccomStops.length - 1} after it` : ''}</span>
              )}
            </span>
            <ChevronRight aria-hidden className="size-5 text-ac2" />
          </Link>
        )}
      </div>

      {phase === 'off' && (
        <div className="lv-enter rounded-[var(--r)] bg-tag p-[18px] text-tag-ink">
          <h2 className="font-serif text-lg font-semibold leading-[1.35]">The plan still says {current?.city}.</h2>
          <Link href="/itinerary" className="mt-1 flex items-center justify-between border-b border-ln py-[13px]">
            <span>
              <span className="block text-base font-semibold text-ac">Add {placeName} as a stop</span>
              <span className="block text-base text-tx2">joins the plan now · ends when you check in somewhere else</span>
            </span>
            <ChevronRight aria-hidden className="size-5 text-ac2" />
          </Link>
          <button onClick={() => setDriftDismissed(true)} className="flex w-full items-center justify-between py-[13px] text-left">
            <span>
              <span className="block text-base font-semibold">Leave it as is</span>
              <span className="block text-base text-tx2">nothing moves</span>
            </span>
            <ChevronRight aria-hidden className="size-5 text-ac2" />
          </button>
        </div>
      )}

      <Link
        href="/live"
        className="flex items-center justify-center gap-2 rounded-[var(--r)] bg-ac py-[17px] text-lg font-semibold text-on"
      >
        <MapPin aria-hidden className="size-5" strokeWidth={2.2} /> Check in - where are you?
      </Link>
      {phase === 'arrive' && (
        <Link href="/live" className="flex items-center justify-center gap-2 rounded-[var(--rCtl)] bg-ac2-soft py-3.5 text-base font-semibold text-ac2-deep">
          <PlaneLanding aria-hidden className="size-5" strokeWidth={2} /> Arrived
        </Link>
      )}
      <ComingUp state={s} todayIso={todayIso} />

      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-track">
          <span className="block h-full rounded-full bg-ac" style={{ width: tripPct + '%' }} />
        </div>
        <div className="mt-1.5 flex justify-between text-base text-tx2">
          <span>{current ? `${current.city}, stop ${stopNo} of ${inPlan.length}` : s.meta.tripName}</span>
          {s.meta.endDate && <span>home {new Date(s.meta.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
        </div>
      </div>

      <Link href="/money" className={card + ' flex items-center justify-between'}>
        <span>
          <span className="block text-base font-semibold">Spent {fmt(recapMid.spent)} of {fmt(b.grand)} estimated</span>
          <span className="block text-base text-tx2">
            {b.grand > 0 ? Math.round((recapMid.spent / b.grand) * 100) : 0}% in ·{' '}
            <span className="font-semibold text-ac2-deep">{recapMid.spent <= (b.grand * (day ?? 0)) / Math.max(1, b.totalNights) ? 'on track' : 'ahead of plan'}</span>
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 text-ac2" />
      </Link>

      <div className="flex items-center justify-between">
        <span className="text-base font-semibold uppercase tracking-[.12em] text-tx2">Recent activity{events.data ? ` · ${events.data.length}` : ''}</span>
        <Link href="/live" className="-my-2.5 inline-flex min-h-11 items-center text-base font-semibold text-ac2">All check-ins ›</Link>
      </div>
      {events.data && events.data.length > 0 && (
        <div className="rounded-[var(--r)] bg-sf px-3.5 text-tx">
          {events.data.slice(0, 4).map((e, i, arr) => (
            <FeedRow key={e.id} e={e} last={i === arr.length - 1} />
          ))}
        </div>
      )}
    </main>
  )
}

function FeedRow({ e, last }: { e: TripEvent; last: boolean }) {
  const title =
    e.kind === 'arrived'
      ? `Arrived in ${(e.payload.city as string) ?? ''}`
      : ((e.payload.placeName as string) ?? (e.payload.text as string) ?? 'Check-in')
  const when = new Date(e.occurred_at).toLocaleDateString('en-GB', { month: 'short', day: '2-digit' }) +
    ', ' + new Date(e.occurred_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className={'flex items-start gap-3 py-[13px] ' + (last ? '' : 'border-b border-ln')}>
      <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[20px] bg-tag text-tag-ink">
        {e.kind === 'arrived' ? <PlaneLanding className="size-5" strokeWidth={2} /> : <MapPin className="size-5" strokeWidth={2} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">{title}</span>
        {e.check_in?.rating != null && (
          <span className="block text-base tracking-[.1em] text-warn">{'★'.repeat(e.check_in.rating)}{'☆'.repeat(5 - e.check_in.rating)}</span>
        )}
        {e.check_in?.comment && <span className="block text-base leading-snug text-tx2">{e.check_in.comment}</span>}
        <span className="block text-base text-tx2">{when}</span>
      </span>
    </div>
  )
}

// Scroll to top whenever the Home phase flips (handoff rule: phase/screen
// change resets scroll).
function useScrollReset(phase: string) {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [phase])
}

// useSyncExternalStore helpers — module-level so their identities are stable.
const subscribeNever = () => () => {}
const snapTrue = () => true
const snapFalse = () => false
const snapOnline = () => navigator.onLine
const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}
