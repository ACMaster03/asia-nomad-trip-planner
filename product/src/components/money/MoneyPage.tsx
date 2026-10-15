'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripRole } from '@/lib/trips/useTripRole'
import { useHomeBase } from '@/lib/trips/useHomeBase'
import { useZoom } from '@/lib/motion/useZoom'
import { useToday } from '@/lib/useToday'
import { useCameFrom } from '@/lib/useCameFrom'
import { useSetTrackSpending, useTrackSpending } from '@/lib/trips/useTrackSpending'
import { hasLoggedSpending, isQuiet, type Tracking } from '@/lib/trips/tracking'
import { usePlanSync } from '@/lib/trips/usePlanSync'
import { moneyModel } from '@/lib/trips/moneyModel'
import { moneyKicker, tripKicker } from '@/lib/trips/kicker'
import type { Upcoming } from '@/lib/trips/moneyRows'
import { addDays } from '@/lib/trips/spending'
import { moneyUnlocks, moreLine } from '@/lib/trips/unlocks'
import { buildTimeline, homeFor, legFor } from '@/lib/trips/timeline'
import { nightsBetween } from '@/lib/trips/format'
import { SaveError } from '@/components/trips/SaveError'
import { ViewerNotice } from '@/components/trips/ViewerNotice'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { TripSheets, type SheetState } from '@/components/trips/TripSheets'
import { useTripEdits } from '@/components/trips/useTripEdits'
import { DailySpendChart, type Range } from './DailySpendChart'
import { WhereItGoes } from './WhereItGoes'
import { BookingsCard } from './BookingsCard'
import { SubscriptionsCard } from './SubscriptionsCard'
import { SubscriptionSheet } from './SubscriptionSheet'
import { useSubscriptionEdits } from './useSubscriptionEdits'
import { LatestCard } from './LatestCard'
import { UpcomingCard } from './UpcomingCard'
import { TopCard } from './TopCard'
import { PlanCard } from './PlanCard'
import { EntryEditor } from './EntryEditor'
import { ChargeNotice } from './ChargeNotice'
import { SubsOffer } from './SubsOffer'
import { subsOfferRows } from '@/lib/trips/subsOffer'
import { TrackQuestion } from './TrackQuestion'
import { CardLabel } from './CardLabel'
import type { LedgerEntry } from '@/lib/trips/types'

// Money — ONE page (round-two design signed off 2026-09-13; round three
// 2026-09-19). No tabs and no split: a Spending / Plan segmented control was
// drafted and dropped, because two tabs drift straight back into the old
// Budget / Monthly / Ledger problem under different names.
//
// Since round 4a of the redesign (docs/WEB-IOS-REDESIGN.md, 14 Oct) the page
// is the phone's MoneyScreen.swift: the top card (this stop or the whole
// journey, the budget ring, before departure the estimate alone), Upcoming
// charges, Latest, Daily spend and Where it goes (not before departure), Plan,
// then Bookings and Subscriptions, always open (Patrik, 29 Sep: no card
// folds). The All entries row went (Latest and Upcoming lead there) and the
// Budget cap row too (the ring and the Budget row open the settings), and the
// Track spending switch moved to Trip settings, as the phone's (Petra, 14 Oct);
// the quiet page invites instead, as the phone's InviteCard. The three
// numbers of #127 came with it: the days after the plan, "still to pay", a
// flight dated by its charge date.
//
// Stage 2 of mock 16, round 1 (23 Sep): the once-per-account question, "Track
// what you spend on this journey?", as a sheet on the first visit, and the
// quiet page for "Not now": the bookings, the subscriptions, the add button
// and the invitation. The answer lives on the profile (migration 41;
// lib/trips/tracking.ts has the four states). Round 2 (mock 16 §6): the full
// page starts short and earns its cards as entries arrive, per journey
// (lib/trips/unlocks.ts). Once a card has appeared it stays.
//
// Past 900px the cards pair into two columns, with the top card spanning
// both. DOM order IS page order, so the grid never reorders anything and the
// phone reading order survives.
//
// Every figure is derived from the ledger and the plan you already keep
// (lib/trips/spending.ts, moneyModel.ts). The one thing this page stores is a
// subscription's declared cadence (#37) — a schedule cannot be derived from
// history without guessing at it.

const wide = 'min-[900px]:col-span-2'

// The question closed without an answer (a swipe, a tap beside it, Escape)
// stays closed until the app is next opened. Module state rather than React
// state, so moving between tabs does not bring it straight back, while a fresh
// load of the app asks again.
let questionClosedThisVisit = false

export default function MoneyPage() {
  const { fmt, base } = useMoney()
  const router = useRouter()
  const zoom = useZoom()
  const { trip, cities, cityIdx } = useTripScreen()
  const mut = useLedgerMutation()
  const stateMut = useTripMutation()
  const edits = useTripEdits()
  const { canEdit } = useTripRole()
  const today = useToday()
  const track = useTrackSpending()
  const setTrack = useSetTrackSpending()
  const profileHome = useHomeBase().data
  useCameFrom('/money') // so All entries' and Subscriptions' "‹ Money" can come back at once
  const [questionClosed, setQuestionClosed] = useState(() => questionClosedThisVisit)

  const [sheet, setSheet] = useState<{ entry: LedgerEntry | null } | null>(null)
  const subEdits = useSubscriptionEdits(stateMut)
  /** a stay's or a leg's form, opened from Upcoming charges (the Trip sheets, round 3c) */
  const [tripSheet, setTripSheet] = useState<SheetState>(null)
  const [range, setRange] = useState<Range>(14)
  const [end, setEnd] = useState<string | null>(null)

  // Plan → ledger sync, shared with All entries and Home (usePlanSync).
  const imp = usePlanSync(trip.data, canEdit, mut)

  const model = useMemo(
    () => (trip.data && today ? moneyModel(trip.data.state, trip.data.ledger, cityIdx, today) : null),
    [trip.data, cityIdx, today],
  )
  const unlocks = useMemo(
    () => (trip.data && model && today
      ? moneyUnlocks({
        ledger: trip.data.ledger, todayIso: today, tripStart: trip.data.state.meta.startDate || undefined,
        pace: model.pace, recorded: trip.data.state.moneyUnlocked, createdAt: trip.data.created_at,
      })
      : null),
    [trip.data, model, today],
  )
  const tl = useMemo(() => (trip.data ? buildTimeline(trip.data.state, homeFor(profileHome, trip.data.state.meta)) : null), [trip.data, profileHome])
  // Record the day a card first qualifies, so it never disappears again on this
  // journey. Editors only, like the import above; a viewer reads what they wrote.
  // Keeps any date already there: the first appearance is the one that counts.
  // A journey from before round 2 has nothing to record (it keeps everything,
  // lib/trips/unlocks.ts), so opening Money saves nothing to it.
  // Each card is asked for once while its save is on the way: a refetch that
  // lands before it (any ledger write refetches) would otherwise queue it again
  // (the reload loop of 25 Sep, lib/trips/ledgerOps.ts). A failed save lets it
  // be asked for again.
  const recording = useRef(new Set<string>())
  useEffect(() => {
    if (!canEdit || !unlocks || !today || !trip.data) return
    const tripId = trip.data.id
    const fresh = unlocks.toRecord.filter((k) => !recording.current.has(`${tripId}:${k}`))
    if (!fresh.length) return
    fresh.forEach((k) => recording.current.add(`${tripId}:${k}`))
    stateMut.mutate(
      (cur) => ({
        ...cur,
        moneyUnlocked: { ...Object.fromEntries(fresh.map((k) => [k, today])), ...cur.moneyUnlocked },
      }),
      { onError: () => fresh.forEach((k) => recording.current.delete(`${tripId}:${k}`)) },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stateMut is stable; unlocks derives from trip.data
  }, [unlocks, canEdit, today])

  // The answer decides the page's shape, so Money waits for it, but only on a
  // device's first visit (it is cached like everything else) and never past a
  // failed read, which falls back to the full page.
  const answer: Tracking | undefined = track.data ?? (track.isError ? 'unknown' : undefined)
  if (trip.isPending || (trip.data && (!today || answer === undefined))) {
    return <main className="mx-auto max-w-xl p-6 text-base text-tx2">Loading…</main>
  }
  if (!trip.data || !model || !unlocks || !tl) return <CreateTripEmptyState />
  const tracking: Tracking = answer ?? 'unknown'
  const quiet = isQuiet(tracking, hasLoggedSpending(trip.data.ledger))
  const s = trip.data.state
  const ledger = trip.data.ledger
  // The one-time offer (mock 16 §8): editors, on the full page, until someone
  // answers it. Cheap enough to derive on every render.
  const offer = canEdit && !quiet && !s.subsOfferDone ? subsOfferRows(ledger, s.subscriptions ?? []) : []
  const { pace, plan, bookings, projection, subs, beforeDeparture } = model
  const tripStart = s.meta.startDate || undefined

  // chart window: `range` days ending on `end` (today unless paged back). Until
  // the journey has 14 days with everyday entries there is no switch and no
  // paging: the window is the days there are, from the first everyday entry,
  // 14 at most, and Where it goes counts the same days.
  const lockedFrom = unlocks.firstEveryday && unlocks.firstEveryday > addDays(today, -13) ? unlocks.firstEveryday : addDays(today, -13)
  const to = unlocks.range ? end ?? today : today
  const from = unlocks.range ? addDays(to, -(range - 1)) : lockedFrom
  const windowDays = nightsBetween(from, to) + 1
  const chartRange: Range = unlocks.range ? range : windowDays <= 7 ? 7 : 14
  const firstDate = ledger.reduce((m, e) => (e.date && e.date < m ? e.date : m), today)
  const canBack = from > firstDate
  const canFwd = to < today
  const page = (dir: -1 | 1) => {
    const next = addDays(to, dir * range)
    setEnd(next >= today ? null : next)
  }
  const rangeLabel = `${unlocks.range ? range : windowDays} days`
  // A tapped bar's "Open in All entries" opens that screen at the day; the
  // list there pages far enough down to scroll to it.
  const showDay = (date: string) => router.push(`/money/entries?day=${date}`)

  function importNow() {
    if (!imp) return
    imp.candidates.forEach((entry) => mut.mutate({ kind: 'upsert', entry }))
    stateMut.mutate((cur) => ({ ...cur, autoImport: true }))
  }
  // An upcoming charge opens what it is: the entry's form, or the booking's on Trip (round 3c's sheets).
  function openUpcoming(u: Upcoming) {
    const opens = u.opens
    if (opens.kind === 'entry') { setSheet({ entry: opens.entry }); return }
    if (opens.kind === 'stay') {
      const stay = s.stays.find((x) => x.id === opens.id)
      const seg = stay && s.segments.find((x) => x.id === stay.segId)
      if (stay && seg) setTripSheet({ kind: 'stay', seg, stay, range: null })
      return
    }
    const t = s.transport.find((x) => x.id === opens.id)
    if (t && tl) setTripSheet({ kind: 'leg', leg: legFor(tl.legs, t) ?? null, entry: t })
  }

  const allEntriesRow = ledger.length > 0 && (
    <Link href="/money/entries" prefetch onClick={zoom.link('money-entries-row', 'entries')} style={{ viewTransitionName: 'money-entries-row' }} className="lv-settle flex items-center justify-between gap-3 rounded-[var(--r)] bg-sf px-4 py-4">
      <CardLabel>All entries</CardLabel>
      <span className="flex items-center gap-1.5 text-[13.5px] text-tx2">
        {ledger.length}
        <ChevronRight aria-hidden className="size-[12px] text-tx3" strokeWidth={2.6} />
      </span>
    </Link>
  )
  const bookingsCard = <BookingsCard bookings={bookings} fmt={fmt} />
  const subsCard = (
    <SubscriptionsCard
      subs={subs} rates={s.rates} fmt={fmt} todayIso={today} canEdit={canEdit}
      onAdd={() => subEdits.setSubSheet({ sub: null })} onEdit={(sub) => subEdits.setSubSheet({ sub })} onToggleRemind={subEdits.toggleRemind}
    />
  )

  return (
    <main data-screen="money" className="mx-auto grid w-full max-w-xl grid-cols-1 items-start gap-3 px-4 pb-6 pt-[18px] text-tx min-[900px]:max-w-4xl min-[900px]:grid-cols-2">
      {/* The phone's Money header: the name at 30, "Asia · day 45 · Hanoi, night 15" under it,
          and the + as a 42px circle with a hairline, the plus in mauve. Solid, not the
          phone's glass material (Petra, 2026-10-12). */}
      <PageHeader
        className={wide}
        title="Money"
        titleSize={30}
        sub={moneyKicker(s.meta.tripName || 'Journey', tripKicker(s.meta, s.segments, today))}
        subSize={13}
        right={
          canEdit && (
            <button
              onClick={() => setSheet({ entry: null })}
              aria-label="Add an entry"
              title="Add an entry"
              className="flex size-[42px] flex-none items-center justify-center rounded-full border border-ln bg-sf text-ac2"
            >
              <Plus aria-hidden className="size-[18px]" strokeWidth={2.6} />
            </button>
          )
        }
      />
      <div className={wide}><ViewerNotice /></div>
      <div className={wide}>
        <SaveError show={mut.isError} error={mut.error} />
        <SaveError show={stateMut.isError} error={stateMut.error} />
        <SaveError show={edits.mut.isError} error={edits.mut.error} />
        <SaveError show={setTrack.isError} error={setTrack.error} />
      </div>

      {quiet ? (
        // The quiet page (mock 16 §2, the phone's): what you have committed to
        // is the one money question someone who does not track still has, so
        // Bookings and Subscriptions, the way to All entries, and the
        // invitation. The page never says ledger, opt-in or analytics.
        <>
          {bookingsCard}
          {subsCard}
          {allEntriesRow}
          <div className={'lv-settle rounded-[var(--r)] border-[1.5px] border-dashed border-ac-line bg-ac-soft p-4 ' + wide}>
            <div className="font-serif text-[19px] font-semibold">See what a day costs</div>
            <p className="mt-2 text-[14px] text-tx2">Log what you spend as you go, and Money adds your daily pace, where it goes, and where the journey lands.</p>
            <button type="button" onClick={() => setTrack.mutate(true)} disabled={setTrack.isPending} className="mt-3 w-full rounded-[var(--rCtl)] bg-ac py-3 text-base font-semibold text-on disabled:opacity-50">
              Track spending
            </button>
            {canEdit && (
              <button type="button" onClick={() => setSheet({ entry: null })} className="mt-1 flex min-h-11 w-full items-center justify-center text-[13.5px] font-medium text-ac">
                or add a first expense
              </button>
            )}
          </div>
        </>
      ) : (
      <>
      <div className={wide}><TopCard model={model} fmt={fmt} todayIso={today} projecting={unlocks.projection} /></div>

      {/* Under the first card, as in mock 16 §8. Once: gone for good when answered. */}
      {offer.length > 0 && <SubsOffer rows={offer} todayIso={today} mut={mut} stateMut={stateMut} className={wide} />}

      {/* Upcoming charges above Latest, before departure and on the road (#149). */}
      {model.upcoming.length > 0 && <UpcomingCard rows={model.upcoming} fmt={fmt} todayIso={today} canEdit={canEdit} onOpen={openUpcoming} />}
      <LatestCard entries={ledger} rates={s.rates} base={base} fmt={fmt} todayIso={today} canEdit={canEdit} onEdit={(e) => setSheet({ entry: e })} />

      {canEdit && imp && imp.candidates.length > 0 && s.autoImport === false && (
        <div className={'lv-enter lv-settle rounded-[var(--r)] bg-sf p-4 ' + wide}>
          <div className="text-base font-semibold">Import {imp.candidates.length} cost{imp.candidates.length > 1 ? 's' : ''} from the Trip page?</div>
          <p className="mt-1 text-base leading-normal text-tx2">Booked stays and transport with a charge date can be added to All entries and kept in sync with the Trip page.</p>
          <button onClick={importNow} disabled={mut.isPending} className="mt-3 rounded-[var(--rCtl)] bg-ac px-[18px] py-2.5 text-base font-semibold text-on disabled:opacity-50">
            Import and keep importing
          </button>
        </div>
      )}

      {/* Before departure: no daily charts and no line about them (#149). */}
      {!beforeDeparture && unlocks.chart && (
        <DailySpendChart
          ledger={ledger} rates={s.rates} from={from} to={to} todayIso={today} tripStart={tripStart}
          range={chartRange} onRange={(r) => { setRange(r); setEnd(null) }} onPage={page} canBack={canBack} canFwd={canFwd}
          fmt={fmt} onShowDay={showDay} controls={unlocks.range}
        />
      )}
      {!beforeDeparture && unlocks.where && <WhereItGoes ledger={ledger} rates={s.rates} from={from} to={to} fmt={fmt} rangeLabel={rangeLabel} />}
      {(beforeDeparture || unlocks.projection) && (
        <PlanCard plan={plan} transport={bookings.transport} projection={projection} state={s} fmt={fmt} todayIso={today} unbooked={bookings.unbooked} paceKnown={pace.perDay !== null} />
      )}
      {/* The last line of an early page says what is still to come, so the
          missing cards are neither a mystery nor hidden behind a menu. */}
      {!beforeDeparture && moreLine(unlocks) && <p className={'px-1 text-[13px] text-tx3 ' + wide}>{moreLine(unlocks)}</p>}
      {bookingsCard}
      {subsCard}
      </>
      )}

      {sheet && (
        <EntryEditor
          initial={sheet.entry}
          trip={trip.data}
          todayIso={today}
          mut={mut}
          stateMut={stateMut}
          onClose={() => setSheet(null)}
          // On the quiet page, logging a cost is the answer: saving one turns
          // tracking on, so a cost you add is never hidden (Petra, 23 Sep). The
          // form says so above its button, and the full page opens with the
          // cost in it.
          onAdded={quiet ? () => setTrack.mutate(true) : undefined}
          note={quiet && !sheet.entry ? 'Saving this turns on spending tracking.' : undefined}
        />
      )}
      {subEdits.subSheet && (
        <SubscriptionSheet
          initial={subEdits.subSheet.sub}
          rates={s.rates}
          todayIso={today}
          onSave={subEdits.saveSub}
          onDelete={subEdits.subSheet.sub ? subEdits.delSub : undefined}
          onClose={() => subEdits.setSubSheet(null)}
        />
      )}
      <TripSheets sheet={tripSheet} setSheet={setTripSheet} state={s} tl={tl} cities={cities.data ?? []} cityIdx={cityIdx} edits={edits} />
      <ChargeNotice trip={trip.data} canEdit={canEdit} mut={mut} stateMut={stateMut} />
      {tracking === 'ask' && !questionClosed && (
        <TrackQuestion
          onAnswer={(yes) => setTrack.mutate(yes)}
          onDismiss={() => {
            questionClosedThisVisit = true
            setQuestionClosed(true)
          }}
        />
      )}
    </main>
  )
}
