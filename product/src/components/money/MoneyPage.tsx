'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripRole } from '@/lib/trips/useTripRole'
import { useToday } from '@/lib/useToday'
import { useSetTrackSpending, useTrackSpending } from '@/lib/trips/useTrackSpending'
import { hasLoggedSpending, isQuiet, type Tracking } from '@/lib/trips/tracking'
import { planImports, sourceKey } from '@/lib/trips/importCosts'
import { moneyModel } from '@/lib/trips/moneyModel'
import { pickEntryCurrency } from '@/lib/trips/entryCurrency'
import { countryCurrencies } from '@/lib/catalogue/countryCurrencies'
import { addDays } from '@/lib/trips/spending'
import { categoryLabel } from '@/lib/trips/categories'
import { tripDay } from '@/lib/trips/progress'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { toBase } from '@/lib/trips/format'
import { SaveError } from '@/components/trips/SaveError'
import { ViewerNotice } from '@/components/trips/ViewerNotice'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { DailySpendChart, type Range } from './DailySpendChart'
import { WhereItGoes } from './WhereItGoes'
import { BookingsCard } from './BookingsCard'
import { SubscriptionsCard } from './SubscriptionsCard'
import { SubscriptionSheet } from './SubscriptionSheet'
import { OneOffsCard } from './OneOffsCard'
import { LedgerList } from './LedgerList'
import { LatestStrip } from './LatestStrip'
import { PlanCard } from './PlanCard'
import { EntrySheet } from './EntrySheet'
import { TrackQuestion } from './TrackQuestion'
import { TrackSpendingRow } from './TrackSpendingRow'
import type { LedgerEntry, Subscription } from '@/lib/trips/types'

// Money — ONE page (round-two design signed off 2026-09-13; round three
// 2026-09-19). No tabs and no split: a Spending / Plan segmented control was
// drafted and dropped, because two tabs drift straight back into the old
// Budget / Monthly / Ledger problem under different names.
//
// Order is tense: what we spent, then what is coming, then the receipts.
//   overview → latest → daily spend → where it goes → bookings →
//   subscriptions → one-offs → plan by stop → budget cap → ledger
//
// Stage 1 of mock 16 (2026-09-23, Petra's rounds): the page gets calmer
// before it gets quieter. The Latest strip and a save toast, the budget line
// reduced to a percentage and what is left (the cap amount lives in its own
// row), one-offs with a line per row, the Plan card leading with its one
// number and hiding its maths, and every card's explanatory prose cut or
// moved behind an info tap (#65).
//
// Stage 2, round 1 (mock 16 §1–2, 23 Sep): the once-per-account question,
// "Track what you spend on this journey?", as a sheet on the first visit (over
// the quiet page, or over your own page if you already log costs), and the
// quiet page itself for "Not now": the bookings, the
// add button and one line back. The answer lives on the profile (migration 41;
// lib/trips/tracking.ts has the four states). "Yes" is today's full page. Both
// versions carry one "Track spending" switch right under their first card; the
// cards that unlock as entries arrive are round 2.
//
// A ninth card sat between the plan and the cap and is gone (2026-09-20). It
// answered "what do we need to earn a month", first as projected outflow in
// category bars, then as a spent/earned/net table, then as an average with a
// row per month, then as the average alone. Cut at that point: "too much info
// in a small place, and honestly we are not sure we need a table like this."
// The forward-looking figure it rested on did not go with it - PlanCard still
// ends in "Projected total", itemised. What the page no longer does is divide
// that total by the months left to say what a month has to bring in.
//
// The ledger goes LAST (#38). It used to sit fourth, always fully expanded,
// past a hundred rows on the live trip — everything under it was unreachable
// in practice, which is how #35 came to be filed about a card (PlanCard's
// residual line) that had existed the whole time.
//
// Past 900px the cards pair into two columns, with the overview and the ledger
// spanning both. DOM order IS page order, so the grid never reorders anything
// and the phone reading order survives.
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
  const confirm = useConfirm()
  const toast = useToast()
  const { trip, cityIdx } = useTripScreen()
  const mut = useLedgerMutation()
  const stateMut = useTripMutation()
  const { canEdit } = useTripRole()
  const today = useToday()
  const track = useTrackSpending()
  const setTrack = useSetTrackSpending()
  const [questionClosed, setQuestionClosed] = useState(() => questionClosedThisVisit)

  const [sheet, setSheet] = useState<{ entry: LedgerEntry | null } | null>(null)
  const [subSheet, setSubSheet] = useState<{ sub: Subscription | null } | null>(null)
  const [range, setRange] = useState<Range>(14)
  const [end, setEnd] = useState<string | null>(null)
  const [reveal, setReveal] = useState<{ date: string; n: number } | null>(null)

  // Plan → ledger sync (importCosts.ts). Converges: every upsert is
  // deterministic, so once the refetched document matches the plan this
  // returns three empty arrays and the effect below no-ops.
  const imp = useMemo(() => (trip.data ? planImports(trip.data.state, trip.data.ledger) : null), [trip.data])
  const autoImport = trip.data?.state.autoImport
  useEffect(() => {
    if (!imp) return
    // A viewer must never trigger this: the writes would all bounce off RLS and
    // paint a save-error banner every time they merely OPENED the Money screen.
    if (!canEdit) return
    // Corrections to already-imported rows always apply (one-way sync + orphan
    // flags, and the removal of an extra's row once its paid-on date is
    // cleared). NEW rows flow automatically too unless the user switched that
    // off: a booked stay with a charge date IS money spent (owner review
    // 2026-09-12). `false` is the only value that keeps the ask-first card.
    const ops = [...imp.updates, ...imp.orphans, ...(autoImport !== false ? imp.candidates : [])]
    ops.forEach((entry) => mut.mutate({ kind: 'upsert', entry }))
    imp.removals.forEach((entry) => mut.mutate({ kind: 'delete', id: entry.id }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mut is stable; imp derives from trip.data
  }, [imp, autoImport, canEdit])

  const model = useMemo(
    () => (trip.data && today ? moneyModel(trip.data.state, trip.data.ledger, cityIdx, today) : null),
    [trip.data, cityIdx, today],
  )

  // The answer decides the page's shape, so Money waits for it, but only on a
  // device's first visit (it is cached like everything else) and never past a
  // failed read, which falls back to the full page.
  const answer: Tracking | undefined = track.data ?? (track.isError ? 'unknown' : undefined)
  if (trip.isPending || (trip.data && (!today || answer === undefined))) {
    return <main className="mx-auto max-w-xl p-6 text-base text-tx2">Loading…</main>
  }
  if (!trip.data || !model) return <CreateTripEmptyState />
  const tracking: Tracking = answer ?? 'unknown'
  const quiet = isQuiet(tracking, hasLoggedSpending(trip.data.ledger))
  const s = trip.data.state
  const ledger = trip.data.ledger
  const { current, pace, plan, bookings, projection, subs, beyond, tripEnd } = model
  const tripStart = s.meta.startDate || undefined
  const day = tripDay(s.meta, today)

  // chart window: `range` days ending on `end` (today unless paged back)
  const to = end ?? today
  const from = addDays(to, -(range - 1))
  const firstDate = ledger.reduce((m, e) => (e.date && e.date < m ? e.date : m), today)
  const canBack = from > firstDate
  const canFwd = to < today
  const page = (dir: -1 | 1) => {
    const next = addDays(to, dir * range)
    setEnd(next >= today ? null : next)
  }
  const rangeLabel = `${range} days`
  // The ledger is paged now, so a tapped bar has to page it far enough down
  // before it can scroll — LedgerList owns both halves of that.
  const scrollToDay = (date: string) => setReveal((r) => ({ date, n: (r?.n ?? 0) + 1 }))

  const plannedNights = plan.reduce((a, p) => a + p.nights, 0)
  const cap = s.meta.budgetCap || 0
  // The bar measures ACTUAL SPEND against the budget cap (owner decision,
  // 2026-09-19). It used to be spent / projected with "pre-trip estimate"
  // underneath: a denominator that moved every time the pace changed, sitting
  // over a figure invented before departure. This one is a ceiling you set.
  const capPct = cap > 0 ? Math.round((projection.spent / cap) * 100) : 0
  const overCap = cap > 0 && projection.spent > cap
  const lastCur = ledger.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).find((e) => e.type === 'expense')?.currency ?? base
  const beyondNames = beyond.rows.slice(0, 3).map((r) => categoryLabel(r.category).toLowerCase()).join(', ')
  // A new entry opens on the money you are actually holding today. `current` is
  // the stop that contains today's date, so this is empty before departure and
  // on the days between stops, and the sheet falls back to what you last typed.
  const hereCodes = countryCurrencies(current?.country)
  const entryCur = pickEntryCurrency({
    hereCodes,
    watched: Object.keys(s.rates ?? {}),
    lastUsed: lastCur,
    base,
  })

  function save(entry: LedgerEntry) {
    const isNew = !sheet?.entry
    mut.mutate({ kind: 'upsert', entry })
    setSheet(null)
    // The two-second confirmation (mock 16 §3): what landed, so nobody scrolls to check.
    // On the quiet page, logging a cost is the answer: saving one turns
    // tracking on, so a cost you add is never hidden (Petra, 23 Sep). The form
    // says so above its button, and the full page opens with the cost in it.
    if (quiet && isNew) setTrack.mutate(true)
    toast(`${isNew ? 'Added' : 'Saved'} · ${fmt(toBase(entry.amount, entry.currency, s.rates))} · ${entry.note?.trim() || categoryLabel(entry.category)}`)
  }
  async function del(entry: LedgerEntry) {
    const listedExtra = entry.source?.kind === 'extra' ? s.extras.find((x) => x.id === entry.source!.id) : undefined
    if (listedExtra) {
      // The paid-on date IS this row (importCosts.ts): clear the date and the
      // reconcile effect above deletes the row — one write, no skip record,
      // and setting the date again brings the payment back.
      const ok = await confirm({
        title: 'Remove this payment?',
        body: `“${listedExtra.label}” goes back to not paid on the Trip page. Give it a paid-on date again to bring the payment back.`,
        confirmLabel: 'Remove',
      })
      if (!ok) return
      stateMut.mutate((cur) => ({
        ...cur,
        extras: cur.extras.map((x) => (x.id === listedExtra.id ? { ...x, paidOn: undefined } : x)),
      }))
    } else if (entry.source) {
      // Without the skip record, reconcile would resurrect the row next visit.
      const ok = await confirm({
        title: 'Remove this imported cost?',
        body: 'The booking stays on the Trip page, but it won’t be re-imported here.',
        confirmLabel: 'Remove',
      })
      if (!ok) return
      const key = sourceKey(entry.source)
      // Persist the skip BEFORE deleting: a ledger refetch landing between the
      // two writes would otherwise re-import the row.
      stateMut.mutate(
        (cur) => ({ ...cur, importSkip: [...new Set([...(cur.importSkip ?? []), key])] }),
        { onSuccess: () => mut.mutate({ kind: 'delete', id: entry.id }) },
      )
    } else {
      if (!(await confirm({ title: 'Delete this entry?' }))) return
      mut.mutate({ kind: 'delete', id: entry.id })
    }
    setSheet(null)
  }
  function importNow() {
    if (!imp) return
    imp.candidates.forEach((entry) => mut.mutate({ kind: 'upsert', entry }))
    stateMut.mutate((cur) => ({ ...cur, autoImport: true }))
  }
  function saveSub(sub: Subscription) {
    stateMut.mutate((cur) => {
      const list = cur.subscriptions ?? []
      return {
        ...cur,
        subscriptions: list.some((x) => x.id === sub.id) ? list.map((x) => (x.id === sub.id ? sub : x)) : [...list, sub],
      }
    })
    setSubSheet(null)
  }
  async function delSub(sub: Subscription) {
    const ok = await confirm({
      title: 'Delete this subscription?',
      body: '“Mark cancelled” keeps what it already charged; deleting forgets it.',
    })
    if (!ok) return
    stateMut.mutate((cur) => ({ ...cur, subscriptions: (cur.subscriptions ?? []).filter((x) => x.id !== sub.id) }))
    setSubSheet(null)
  }
  function toggleRemind(sub: Subscription) {
    stateMut.mutate((cur) => ({
      ...cur,
      subscriptions: (cur.subscriptions ?? []).map((x) =>
        x.id === sub.id ? { ...x, remind: !x.remind, leadDays: x.leadDays ?? 3 } : x,
      ),
    }))
  }

  return (
    <main className="mx-auto grid w-full max-w-xl grid-cols-1 items-start gap-3 px-[18px] pb-6 pt-[18px] text-tx min-[900px]:max-w-4xl min-[900px]:grid-cols-2">
      <div className={'flex items-start justify-between gap-3 ' + wide}>
        <div>
          <h1 className="font-serif text-[25px] font-semibold leading-[1.15] tracking-[-.01em]">Money</h1>
          <p className="mt-0.5 text-[14px] text-tx2">
            {s.meta.tripName}{day ? ` · day ${day}` : ''}{current ? ` · ${current.city}` : ''}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setSheet({ entry: null })}
            aria-label="Add an entry"
            title="Add an entry"
            className="flex size-[46px] flex-none items-center justify-center rounded-full bg-ac2-soft text-ac2-deep"
          >
            <Plus aria-hidden className="size-6" />
          </button>
        )}
      </div>
      <div className={wide}><ViewerNotice /></div>
      <div className={wide}>
        <SaveError show={mut.isError} error={mut.error} />
        <SaveError show={stateMut.isError} error={stateMut.error} />
        <SaveError show={setTrack.isError} error={setTrack.error} />
      </div>

      {quiet ? (
        // The quiet page (mock 16 §2): the Bookings card is the whole page,
        // because "what have we committed to" is the one money question someone
        // who does not track still has. The page never says ledger, opt-in or
        // analytics; it says bookings and spending.
        //
        // No list of spending under the switch, although the mock had one for
        // what you add after saying no. Petra, 23 Sep, before #79 merged: a
        // list of spending right under "Spending isn't tracked on this journey"
        // makes no sense, and for anyone who logged before saying no it was
        // the whole ledger again. The add button stays (#62), and saving a
        // cost from it turns tracking on (see save below).
        <>
          <BookingsCard
            stays={bookings.stays} transport={bookings.transport}
            paid={bookings.paid} toPay={bookings.toPay}
            draftedStays={bookings.draftedStays} draftStays={bookings.draftStays}
            fmt={fmt} todayIso={today}
          />
          <TrackSpendingRow on={false} onChange={(on) => setTrack.mutate(on)} className={wide} />
        </>
      ) : (
      <>
      {/* overview */}
      <div className={'lv-enter rounded-[var(--r)] bg-sf p-5 ' + wide}>
        <div className="text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">
          Spent so far{day ? ` · ${day} ${day === 1 ? 'day' : 'days'}` : tripStart ? ' · before departure' : ''}
        </div>
        <div className="mt-0.5 text-[32px] font-semibold leading-[1.1] tracking-[-.02em]">{fmt(projection.spent)}</div>
        {projection.scheduled > 0 && (
          <div className="mt-1 text-[14px] text-tx2">
            + <b className="text-tx">{fmt(projection.scheduled)}</b> scheduled · dated after today, not spent yet
          </div>
        )}
        <div className="mt-3.5 grid grid-cols-2 gap-3 border-t border-ln pt-3">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">Per day</div>
            {pace.perDay !== null ? (
              <>
                <div className="mt-0.5 text-[22px] font-semibold">{fmt(pace.perDay)}</div>
                <div className="text-[13px] text-tx2">everyday costs over {pace.days} days {pace.scope === 'stop' && current ? `in ${current.city}` : 'since departure'}</div>
              </>
            ) : (
              <>
                <div className="mt-0.5 text-[22px] font-semibold text-tx3">measuring…</div>
                <div className="text-[13px] text-tx2">{day ? `${Math.min(day, 3)} of 3 days` : 'starts on departure day'}</div>
              </>
            )}
          </div>
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">Projected total</div>
            <div className="mt-0.5 whitespace-nowrap text-[22px] font-semibold">{fmt(projection.projected)}</div>
            <div className="text-[13px] text-tx2">{plannedNights} planned nights, {pace.perDay !== null ? 'at this pace' : 'city averages'}</div>
          </div>
        </div>
        {cap > 0 && (
          <>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-track">
              <span
                className={'lv-grow block h-full rounded-full ' + (overCap ? 'bg-warn' : 'bg-ac')}
                style={{ width: Math.min(100, capPct) + '%' }}
              />
            </div>
            {/* A percentage and what is left, nothing else (Petra, round 1: the cap
                amount beside them read as two unrelated numbers). The cap itself
                lives in its own row further down. */}
            <div className="mt-1.5 flex justify-between gap-3 text-[13px] text-tx2">
              <span className="flex-none"><b className="text-tx">{capPct}% of your budget</b></span>
              <span className="text-right">
                {overCap
                  ? <b className="text-warn">{fmt(projection.spent - cap)} over</b>
                  : <><b className="text-tx">{fmt(cap - projection.spent)}</b> left</>}
              </span>
            </div>
          </>
        )}
        {/* #35: the per-day rate leaves out flights, stays, gear, fees and the
            subscriptions — correctly. Until now it did it in silence, and
            nothing on the page admitted that 989 000 of a million spent was
            simply not in that number. */}
        {beyond.total > 0 && (
          <div className="mt-3.5 rounded-[var(--rCtl)] bg-inp px-3.5 py-3">
            <div className="text-base font-semibold">+ {fmt(beyond.total)} beyond the everyday</div>
            <div className="mt-0.5 text-[13px] text-tx2">
              {beyondNames ? beyondNames[0].toUpperCase() + beyondNames.slice(1) + '. ' : ''}Counted below, not in the per-day rate.
            </div>
          </div>
        )}
      </div>

      {/* Right under the first card, as on the quiet page. Hidden when the
          answer can't be read: a switch that cannot save would lie. */}
      {tracking !== 'unknown' && <TrackSpendingRow on onChange={(on) => setTrack.mutate(on)} className={wide} />}

      <LatestStrip entries={ledger} rates={s.rates} fmt={fmt} todayIso={today} canEdit={canEdit} onEdit={(e) => setSheet({ entry: e })} />

      {canEdit && imp && imp.candidates.length > 0 && autoImport === false && (
        <div className={'lv-enter rounded-[var(--r)] bg-sf p-4 ' + wide}>
          <div className="text-base font-semibold">Import {imp.candidates.length} cost{imp.candidates.length > 1 ? 's' : ''} from the Trip page?</div>
          <p className="mt-1 text-base leading-normal text-tx2">Booked stays and transport with a charge date, and extras with a paid-on date, can sit in the ledger as rows kept in sync with the Trip page.</p>
          <button onClick={importNow} disabled={mut.isPending} className="mt-3 rounded-[var(--rCtl)] bg-ac px-[18px] py-2.5 text-base font-semibold text-on disabled:opacity-50">
            Import and keep importing
          </button>
        </div>
      )}

      <DailySpendChart
        ledger={ledger} rates={s.rates} from={from} to={to} todayIso={today} tripStart={tripStart}
        range={range} onRange={(r) => { setRange(r); setEnd(null) }} onPage={page} canBack={canBack} canFwd={canFwd}
        fmt={fmt} onShowDay={scrollToDay}
      />
      <WhereItGoes ledger={ledger} rates={s.rates} from={from} to={to} fmt={fmt} rangeLabel={rangeLabel} />
      <BookingsCard
        stays={bookings.stays} transport={bookings.transport}
        paid={bookings.paid} toPay={bookings.toPay}
        draftedStays={bookings.draftedStays} draftStays={bookings.draftStays}
        fmt={fmt} todayIso={today}
      />
      <SubscriptionsCard
        subs={subs} rates={s.rates} fmt={fmt} todayIso={today} tripEnd={tripEnd}
        subsAhead={projection.subsAhead} canEdit={canEdit}
        onAdd={() => setSubSheet({ sub: null })}
        onEdit={(sub) => setSubSheet({ sub })}
        onToggleRemind={toggleRemind}
      />
      <OneOffsCard state={s} ledger={ledger} fmt={fmt} todayIso={today} />
      <PlanCard plan={plan} transport={bookings.transport} projection={projection} state={s} fmt={fmt} todayIso={today} unbooked={bookings.unbooked} paceKnown={pace.perDay !== null} />
      <Link href="/settings" className="flex items-center justify-between rounded-[var(--r)] bg-sf px-[18px] py-3.5">
        <span>
          <span className="block text-base font-semibold">{cap > 0 ? 'Budget cap' : 'Set a budget cap'}</span>
          <span className="block text-[13px] text-tx2">
            {/* In words (Petra, 23 Sep: "projected uses 132 %" meant nothing): what the
                journey does to the cap at this pace, amber when it goes over. */}
            {cap > 0
              ? pace.perDay === null
                ? `${fmt(cap)} · ${capPct}% spent`
                : projection.projected > cap
                  ? <>{fmt(cap)} · <span className="text-warn">at this pace the journey goes {fmt(projection.projected - cap)} over it</span></>
                  : `${fmt(cap)} · at this pace the journey uses ${Math.round((projection.projected / cap) * 100)}% of it`
              : 'a ceiling for the whole trip, in Settings'}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 text-ac2" />
      </Link>
      <div id="ledger" className={wide + ' scroll-mt-4'}>
        <LedgerList
          entries={ledger} rates={s.rates} base={base} fmt={fmt} tripStart={tripStart} todayIso={today}
          canEdit={canEdit} onEdit={(e) => setSheet({ entry: e })} reveal={reveal}
        />
      </div>
      </>
      )}

      {sheet && (
        <EntrySheet
          initial={sheet.entry}
          ledger={ledger}
          rates={s.rates}
          defaultCur={entryCur}
          defaultCurWhere={hereCodes.includes(entryCur) ? current?.country : null}
          onSave={save}
          onDelete={sheet.entry ? del : undefined}
          onClose={() => setSheet(null)}
          note={quiet && !sheet.entry ? 'Saving this turns on spending tracking.' : undefined}
        />
      )}
      {subSheet && (
        <SubscriptionSheet
          initial={subSheet.sub}
          rates={s.rates}
          todayIso={today}
          onSave={saveSub}
          onDelete={subSheet.sub ? delSub : undefined}
          onClose={() => setSubSheet(null)}
        />
      )}
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
