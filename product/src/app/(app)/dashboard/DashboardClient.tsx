'use client'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, PlaneLanding, Plus, WifiOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useMoney } from '@/lib/trips/Money'
import { fmtMoneyShort } from '@/lib/trips/format'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { computeBudget } from '@/lib/trips/budget'
import { tripDay, tripLength, stopProgress } from '@/lib/trips/progress'
import { shortDate, stayCounts, stayForNight } from '@/lib/trips/timeline'
import { isBookedStatus } from '@/lib/trips/commitment'
import { PageHeader } from '@/components/ui/PageHeader'
import { AccountAvatar } from '@/components/ui/Avatar'
import { Waiting } from '@/components/ui/TravelLoader'
import { useTripEvents } from '@/lib/trips/useTripEvents'
import { stopBurnRate } from '@/lib/trips/spending'
import { useTrackSpending } from '@/lib/trips/useTrackSpending'
import { useTripRole } from '@/lib/trips/useTripRole'
import { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { usePlanSync } from '@/lib/trips/usePlanSync'
import { ChargeNotice } from '@/components/money/ChargeNotice'
import { tripPhase, tripRecap } from '@/lib/trips/recap'
import { fetchTripEvents } from '@/lib/trips/events'
import { tk } from '@/lib/trips/keys'
import { useTripScope } from '@/lib/trips/TripScope'
import { Modal } from '@/components/trips/Modal'
import { OnboardingWizard } from '@/components/trips/OnboardingWizard'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { RemindersCard } from '../reminders/HomeReminders'
import FollowingSection, { useFollowedCards } from '@/components/social/FollowingSection'
import FollowerHome from '@/components/social/FollowerHome'

// Home, as the phone draws it (ios/Livhold/Home/HomeScreen.swift, mock rounds
// 1–3, Patrik, 2 Oct; the web follows since 12 Oct, docs/WEB-IOS-REDESIGN.md
// round 2a). The phase decides the page:
//   before the journey → the first stop and its countdown, Before you fly, the estimate
//   on the road        → the stop card (with its money line), Coming up
//   arrival day        → the stop card, "Arrived in …"
//   between stops      → a card saying no stop covers tonight, and where next
//   after the journey  → the recap in figures, Plan the next journey
// Left out on purpose, as on the phone: the big Check in button (the tab bar
// has it), the money card on the road (the stop card's line instead), the
// off-route card (#134), "Next" (the stop card opens Trip), the departure and
// length tiles and "Explore city costs" before the journey (Patrik, 12 Oct).
// The people you follow (FollowingSection) come after your stop card during
// your journey, and before your own journey otherwise, when theirs is under
// way (Patrik, 3 Oct: whichever is live goes first).

const card = 'rounded-[var(--r)] bg-sf p-[18px] text-tx'
const kicker = 'text-[12.5px] font-semibold uppercase tracking-[.104em]'

function fmtDay(d: Date, withYear = false) {
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "1 Sep 2026", for the line under "Home again". */
function withYear(iso: string) {
  const d = new Date(iso + 'T00:00:00Z')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export default function DashboardClient({
  userEmail,
  userName,
  userId,
}: {
  userEmail?: string
  userName?: string
  userId?: string
}) {
  const sb = createClient()
  const { fmt, base } = useMoney()
  const { tripId } = useTripScope()
  const { trip, cityIdx } = useTripScreen()
  const { recordArrived } = useTripEvents()
  // Home is where the app opens, so the plan → ledger sync runs here too:
  // a subscription charge whose date has come lands, and ChargeNotice below
  // announces it (Patrik and Petra, 24 Sep, #37).
  const { canEdit } = useTripRole()
  const ledgerMut = useLedgerMutation()
  const stateMut = useTripMutation()
  usePlanSync(trip.data, canEdit, ledgerMut)
  // The stop card's money line shows only to someone tracking their spending
  // (the once-per-account answer, migration 41), as on the phone.
  const tracking = useTrackSpending().data
  // Clock-dependent → client-only (SSR snapshot renders the pre layout, same
  // hydration rule the old dashboard followed, minus the setState-in-effect).
  const mounted = useSyncExternalStore(subscribeNever, snapTrue, snapFalse)
  const offline = !useSyncExternalStore(subscribeOnline, snapOnline, snapTrue)
  const [wizardOpen, setWizardOpen] = useState(false)
  // Whichever is live goes first: a followed journey under way today sits above
  // your own before and after your dates.
  const todayIsoNow = new Date().toISOString().slice(0, 10)
  const peopleLive = useFollowedCards(todayIsoNow).anyLive

  const events = useQuery({
    queryKey: tk.events(tripId ?? 'none'),
    queryFn: () => fetchTripEvents(sb, tripId!),
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
  // The day you move belongs to the stop you move to, as on Trip (Timeline.tsx,
  // and the iOS app's TimelineLogic): arrive ≤ today < depart. Home gave it to
  // the stop you leave, so on a travel day it said "Bangkok, night 29" and "No
  // bed tonight" (the bed is in Hanoi), named the stop after Hanoi as Next, and
  // never showed Hanoi's arrival day (found 28 Sep, two days before that move).
  const current = sorted.find((seg) => seg.arrive <= todayIso && todayIso < seg.depart)
  const nextStop = sorted.find((seg) => seg.arrive > todayIso)
  const stopNo = current ? sorted.indexOf(current) + 1 : 0
  const isArrive = basePhase === 'live' && current?.arrive === todayIso
  const phase = basePhase === 'live' ? (isArrive ? 'arrive' : 'live') : basePhase
  // Already told us you got here? Then there is nothing left to press.
  const arrivedHere =
    !!current &&
    (events.data ?? []).some(
      (e) =>
        e.kind === 'arrived' &&
        String(e.payload?.city ?? '').toLowerCase() === current.city.toLowerCase(),
    )

  // Phase changes reset scroll (handoff rule).
  useScrollReset(phase)

  // No trip of your own: a follower's Home, or the wizard if you follow nobody.
  if (tripId === null) return <FollowerHome userEmail={userEmail} userName={userName} userId={userId} />
  if (trip.isPending) {
    return (
      <main className="mx-auto max-w-xl px-4">
        <Waiting />
      </main>
    )
  }
  if (!trip.data || !s || !b) return <CreateTripEmptyState />

  // The phone's Home header: the date in small capitals, the journey's name, one line
  // under it, and the avatar that opens Account.
  const header = (eyebrow: string, title: string, sub: string) => (
    <PageHeader eyebrow={eyebrow} title={title} sub={sub} right={<AccountAvatar userName={userName} userEmail={userEmail} />} />
  )
  const chevron = <ChevronRight aria-hidden className="mb-1.5 size-[15px] flex-none text-ac2" strokeWidth={2.6} />

  /* ── after the journey ── */
  if (phase === 'post') {
    const recap = tripRecap(s, trip.data.ledger ?? [], events.data?.filter((e) => e.kind === 'checkin').length ?? 0)
    const span = [s.meta.startDate, s.meta.endDate].filter(Boolean).map((d) => withYear(d!)).join(' – ')
    // Three to a row on a 390px phone: money in millions (the phone's MoneyText.short).
    const figure = (label: string, value: string, tone = 'text-tx') => (
      <div className="min-w-0">
        <div className="text-[11.5px] font-medium uppercase leading-tight tracking-[.096em] text-tx2">{label}</div>
        <div className={'mt-0.5 whitespace-nowrap text-[20px] font-semibold leading-tight tabular-nums ' + tone}>{value}</div>
      </div>
    )
    const row = (href: string, title: string, sub: string) => (
      <Link href={href} className="flex items-center justify-between gap-3 rounded-[var(--r)] bg-sf p-4 text-tx">
        <span className="min-w-0">
          <span className="block text-base font-semibold">{title}</span>
          <span className="block text-[14px] text-tx2">{sub}</span>
        </span>
        <ChevronRight aria-hidden className="size-[14px] flex-none text-ac2" strokeWidth={2.6} />
      </Link>
    )
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-3 px-4 pb-6 pt-3">
        {header(fmtDay(today, true), 'Home again', [s.meta.tripName, span].filter(Boolean).join(' · '))}
        {peopleLive && <FollowingSection today={todayIso} userId={userId} own={events.data ?? []} ownPending={events.isPending} segments={s.segments} className="pb-2" />}
        {/* The journey's wash: the card itself carries the soft green and mauve
            (the phone's JourneyWash), not the page. */}
        <div className="lv-enter rounded-[var(--r)] p-[18px] text-tx lv-journey-wash">
          <div className={kicker + ' text-ac2-deep'}>The journey in figures</div>
          <div className="mt-3 grid grid-cols-3 gap-x-2.5 gap-y-3.5">
            {figure('Nights', String(recap.days))}
            {figure('Stops', String(recap.stops))}
            {figure('Countries', String(recap.countries.length))}
            <div className="col-span-3 border-t border-ln" />
            {figure('Check-ins', String(recap.checkIns), 'text-ac2')}
            {figure('Spent', fmtMoneyShort(recap.spent, base))}
            {recap.leftOfCap !== null
              ? figure(
                  recap.leftOfCap >= 0 ? 'Under budget' : 'Over budget',
                  fmtMoneyShort(Math.abs(recap.leftOfCap), base),
                  recap.leftOfCap >= 0 ? 'text-ac2' : 'text-warn',
                )
              : <div />}
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[var(--rCtl)] bg-ac py-3.5 text-base font-semibold text-on"
          >
            <Plus aria-hidden className="size-[18px]" strokeWidth={2.4} /> Plan the next journey
          </button>
        )}
        {row('/money/entries', 'Final numbers', 'all entries, month by month')}
        {row('/itinerary', 'Look back', 'the timeline and its stays')}
        {!peopleLive && <FollowingSection today={todayIso} userId={userId} own={events.data ?? []} ownPending={events.isPending} segments={s.segments} className="pt-2" />}
        {wizardOpen && (
          <Modal title="New journey" onClose={() => setWizardOpen(false)}>
            <OnboardingWizard onDone={() => setWizardOpen(false)} />
          </Modal>
        )}
      </main>
    )
  }

  /* ── before the journey ── */
  if (phase === 'pre') {
    const first = sorted[0]
    const daysTo = s.meta.startDate ? Math.max(0, Math.ceil((+new Date(s.meta.startDate) - +today) / 86400000)) : null
    const cap = s.meta.budgetCap || 0
    const total = b.grand
    const pct = cap ? Math.round((total / cap) * 100) : null
    const over = cap > 0 && total > cap
    const onAverages = b.missingAccomStops.length
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-3 px-4 pb-6 pt-3">
        {header(fmtDay(today), s.meta.tripName, `${inPlan.length} stops · ${b.totalNights} nights · ${s.meta.travelers} travellers`)}
        {peopleLive && <FollowingSection today={todayIso} userId={userId} own={events.data ?? []} ownPending={events.isPending} segments={s.segments} className="pb-2" />}
        {first ? (
          <Link href="/itinerary" className={card + ' lv-enter block'}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-[7px]">
                <span aria-hidden className="size-[7px] rounded-full bg-ac2" />
                <span className={kicker + ' text-ac2'}>First stop</span>
              </span>
              <span className="text-[14px] font-medium text-tx2">
                {Math.max(1, Math.round((+new Date(first.depart) - +new Date(first.arrive)) / 86400000))} nights
              </span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <span className="font-serif text-[32px] font-semibold leading-[1.15] tracking-[-.01em]">{first.city}</span>
              {chevron}
            </div>
            <p className="mt-[3px] text-[15px] text-tx2">
              {[first.country, `from ${shortDate(first.arrive)}`].filter(Boolean).join(' · ')}
            </p>
            {daysTo !== null && (
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[44px] font-semibold leading-none tabular-nums tracking-[-.02em] text-ac2">{daysTo}</span>
                <span className="text-[17px] font-medium text-tx2">{daysTo === 1 ? 'day to departure' : 'days to departure'}</span>
              </div>
            )}
          </Link>
        ) : (
          <Link href="/itinerary" className={card + ' block text-[15px] text-tx2'}>
            No stops yet. Add the first place you’re going on Trip <span className="text-ac">›</span>
          </Link>
        )}
        <RemindersCard state={s} todayIso={todayIso} mode="beforeYouFly" />
        {inPlan.length > 0 && (
          <Link href="/money" className={card + ' lv-enter block'}>
            <div className="flex items-center justify-between gap-3">
              <span className={kicker + ' text-tx2'}>Estimated total</span>
              {pct !== null && <span className={'text-[15px] font-semibold ' + (over ? 'text-warn' : 'text-ac2')}>{pct}%</span>}
            </div>
            <div className="mt-1 text-[28px] font-semibold tabular-nums tracking-[-.01em]">≈ {fmt(total)}</div>
            {cap > 0 && (
              <>
                <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-track">
                  <span className={'lv-grow block h-full rounded-full ' + (over ? 'bg-warn' : 'bg-ac')} style={{ width: Math.min(100, Math.round((total / cap) * 100)) + '%' }} />
                </div>
                <p className="mt-1.5 text-[14px] text-tx2">
                  of {fmt(cap)} budget ·{' '}
                  {over
                    ? <span className="font-semibold text-warn">{fmt(total - cap)} over</span>
                    : <span className="font-semibold text-ac2-deep">{fmt(cap - total)} left</span>}
                </p>
              </>
            )}
            {onAverages > 0 && (
              <p className="mt-2.5 text-[14px] leading-snug text-warn">
                {onAverages === 1
                  ? '1 stop has no stay yet, so its nights are counted at the city’s average price'
                  : `${onAverages} stops have no stay yet, so their nights are counted at each city’s average price`}
              </p>
            )}
          </Link>
        )}
        {!peopleLive && <FollowingSection today={todayIso} userId={userId} own={events.data ?? []} ownPending={events.isPending} segments={s.segments} className="pt-2" />}
      </main>
    )
  }

  /* ── on the road: live, arrival day, between stops ── */
  // Shared with Trip (lib/trips/progress.ts) so the two screens never
  // disagree on the same morning: Day 1 = departure, night 1 = arrival,
  // "of N" = the trip's own length (planned nights only when open-ended).
  const day = tripDay(s.meta, todayIso)
  const tripDays = tripLength(s.meta, b.totalNights)
  const prog = current ? stopProgress(current, todayIso) : null
  const night = prog?.night ?? null
  const nightsHere = prog?.nights ?? null
  const nightsLeft = prog?.left ?? 0
  // Tonight's bed, by the Trip timeline's rule (#58): a stop can hold several
  // stays, and one only reads "booked" when it is.
  const stay = current ? stayForNight(current, s.stays, todayIso) : null
  const stopHasStay = !!current && s.stays.some((st) => st.segId === current.id && stayCounts(st))
  const burn = current ? stopBurnRate(current, trip.data.ledger ?? [], s.rates, todayIso) : null
  const dayText = day ? `Day ${day}${tripDays ? ` of ${tripDays}` : ''}` : null
  const whereText = current ? `stop ${stopNo} of ${inPlan.length}` : 'between stops'

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 px-4 pb-6 pt-3">
      {header(fmtDay(today), s.meta.tripName, [dayText, whereText].filter(Boolean).join(' · '))}

      {current ? (
        <div className={card + ' lv-enter'}>
          {/* The stop you're in: the card opens it on Trip, its foot opens Money. */}
          <Link href="/itinerary" className="block">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-[7px]">
                <span aria-hidden className="size-[7px] rounded-full bg-ac" />
                <span className={kicker + ' text-ac'}>{isArrive ? 'Arrival day' : 'On plan'}</span>
              </span>
              {night && nightsHere && (
                <span className="text-[14px] font-medium text-tx2">Night {night} of {nightsHere}</span>
              )}
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <span className="font-serif text-[30px] font-semibold leading-[1.15] tracking-[-.01em]">{current.city}</span>
              {chevron}
            </div>
            {/* Tonight's bed by the timeline's rule: amber when it isn't booked or there is none. */}
            <p className="mt-[3px] text-[15px] text-tx2">
              {stay
                ? isBookedStatus(stay.status)
                  ? `${stay.name || 'Stay'} · `
                  : <>{stay.name || 'Stay'} · <span className="text-warn">not booked</span> · </>
                : <><span className="text-warn">{stopHasStay ? 'No bed tonight' : 'No stay yet'}</span> · </>}
              leave {shortDate(current.depart)}
            </p>
            {!isArrive && night && nightsHere && (
              <>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-track">
                  <span className="lv-grow block h-full rounded-full bg-ac" style={{ width: Math.min(100, Math.round((night / nightsHere) * 100)) + '%' }} />
                </div>
                <div className="mt-1.5 text-right text-[14px] font-semibold text-ac2">
                  {nightsLeft} {nightsLeft === 1 ? 'night' : 'nights'} left
                </div>
              </>
            )}
          </Link>
          {/* "Spent here 24 600 Ft · 8 200 Ft a day": the stop's everyday costs so
              far and, from its third day, its pace (Money's This stop view). */}
          {tracking === 'yes' && burn && (
            <Link href="/money" className="mt-2.5 flex min-h-11 items-center justify-between gap-1 border-t border-ln pt-3 text-[14.5px] text-tx2">
              <span className="tabular-nums">
                Spent here <span className="font-semibold text-tx">{fmt(burn.total)}</span>
                {burn.days >= 3 && ` · ${fmt(burn.perDay)} a day`}
              </span>
              <ChevronRight aria-hidden className="size-3 flex-none text-tx3" strokeWidth={2.6} />
            </Link>
          )}
        </div>
      ) : (
        /* A night no stop covers: a gap in the plan, or a night bus. */
        <Link href="/itinerary" className={card + ' lv-enter block'}>
          <div className={kicker + ' text-tx2'}>Between stops</div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <span className="font-serif text-[30px] font-semibold leading-[1.15] tracking-[-.01em]">On the way</span>
            {chevron}
          </div>
          <p className="mt-[3px] text-[15px] text-tx2">
            <span className="text-warn">No stop planned for tonight</span>
            {nextStop && ` · ${nextStop.city} from ${shortDate(nextStop.arrive)}`}
          </p>
        </Link>
      )}

      {/* Arrival day only, editors, and gone once it is recorded. One button, one day, once. */}
      {isArrive && current && canEdit && !arrivedHere && (
        <button
          type="button"
          onClick={() => recordArrived(current.city)}
          className="flex min-h-[50px] items-center justify-center gap-2 rounded-[var(--rCtl)] bg-ac2-soft py-3 text-base font-semibold text-ac2-deep"
        >
          <PlaneLanding aria-hidden className="size-5" strokeWidth={2} /> Arrived in {current.city}
        </button>
      )}

      {offline && (
        <div className="flex items-center gap-1.5 self-center rounded-full bg-warn-soft px-3 py-1.5 text-[13.5px] font-medium text-warn">
          <WifiOff aria-hidden className="size-[14px]" strokeWidth={2.2} /> Offline · edits sync when you’re back online
        </div>
      )}

      <RemindersCard state={s} todayIso={todayIso} mode="comingUp" />

      {/* Your people: the journeys you follow and the latest posts, your own
          rows among them (docs/SOCIAL-SCOPE.md §2). */}
      <FollowingSection today={todayIso} userId={userId} own={events.data ?? []} ownPending={events.isPending} segments={s.segments} className="pt-2" />
      <ChargeNotice trip={trip.data} canEdit={canEdit} mut={ledgerMut} stateMut={stateMut} />
    </main>
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
