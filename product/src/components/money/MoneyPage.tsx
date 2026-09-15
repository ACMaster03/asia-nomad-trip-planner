'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripRole } from '@/lib/trips/useTripRole'
import { useToday } from '@/lib/useToday'
import { planImports, sourceKey } from '@/lib/trips/importCosts'
import { moneyModel } from '@/lib/trips/moneyModel'
import { addDays } from '@/lib/trips/spending'
import { tripDay } from '@/lib/trips/progress'
import { SaveError } from '@/components/trips/SaveError'
import { ViewerNotice } from '@/components/trips/ViewerNotice'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { DailySpendChart, type Range } from './DailySpendChart'
import { WhereItGoes } from './WhereItGoes'
import { BookingsCard } from './BookingsCard'
import { LedgerList } from './LedgerList'
import { PlanCard } from './PlanCard'
import { MonthlyCard } from './MonthlyCard'
import { EntrySheet } from './EntrySheet'
import type { LedgerEntry } from '@/lib/trips/types'

// Money — one page (round-two design, signed off 2026-09-13). Replaces the
// Budget / Monthly / Actual tabs: overview → daily spend → where it goes →
// bookings → ledger → plan by stop → to cover the plan → budget cap. Every
// figure is derived from the ledger you already keep (lib/trips/spending.ts,
// moneyModel.ts); nothing new is stored.

export default function MoneyPage() {
  const { fmt, base } = useMoney()
  const { trip, cityIdx } = useTripScreen()
  const mut = useLedgerMutation()
  const stateMut = useTripMutation()
  const { canEdit } = useTripRole()
  const today = useToday()

  const [sheet, setSheet] = useState<{ entry: LedgerEntry | null } | null>(null)
  const [range, setRange] = useState<Range>(14)
  const [end, setEnd] = useState<string | null>(null)

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
    // flags). NEW rows flow automatically too unless the user switched that
    // off: a booked stay with a charge date IS money spent (owner review
    // 2026-09-12). `false` is the only value that keeps the ask-first card.
    const ops = [...imp.updates, ...imp.orphans, ...(autoImport !== false ? imp.candidates : [])]
    ops.forEach((entry) => mut.mutate({ kind: 'upsert', entry }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mut is stable; imp derives from trip.data
  }, [imp, autoImport, canEdit])

  const model = useMemo(
    () => (trip.data && today ? moneyModel(trip.data.state, trip.data.ledger, cityIdx, today) : null),
    [trip.data, cityIdx, today],
  )

  if (trip.isPending || (trip.data && !today)) return <main className="mx-auto max-w-xl p-6 text-base text-tx2">Loading…</main>
  if (!trip.data || !model) return <CreateTripEmptyState />
  const s = trip.data.state
  const ledger = trip.data.ledger
  const { budget, current, pace, plan, bookings, projection } = model
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
  const scrollToDay = (date: string) => document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const plannedNights = plan.reduce((a, p) => a + p.nights, 0)
  const pct = projection.projected > 0 ? Math.min(100, Math.round((projection.spent / projection.projected) * 100)) : 0
  const cap = s.meta.budgetCap || 0
  const lastCur = ledger.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).find((e) => e.type === 'expense')?.currency ?? base

  function save(entry: LedgerEntry) {
    mut.mutate({ kind: 'upsert', entry })
    setSheet(null)
  }
  function del(entry: LedgerEntry) {
    if (entry.source) {
      // Without the skip record, reconcile would resurrect the row next visit.
      if (!confirm('Remove this imported cost? The booking stays on the Trip page, but it won’t be re-imported here.')) return
      const key = sourceKey(entry.source)
      // Persist the skip BEFORE deleting: a ledger refetch landing between the
      // two writes would otherwise re-import the row.
      stateMut.mutate(
        (cur) => ({ ...cur, importSkip: [...new Set([...(cur.importSkip ?? []), key])] }),
        { onSuccess: () => mut.mutate({ kind: 'delete', id: entry.id }) },
      )
    } else {
      if (!confirm('Delete this entry?')) return
      mut.mutate({ kind: 'delete', id: entry.id })
    }
    setSheet(null)
  }
  function importNow() {
    if (!imp) return
    imp.candidates.forEach((entry) => mut.mutate({ kind: 'upsert', entry }))
    stateMut.mutate((cur) => ({ ...cur, autoImport: true }))
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px] text-tx">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-[25px] font-semibold leading-[1.15] tracking-[-.01em]">Money</h1>
          <p className="mt-0.5 text-[14px] text-tx2">
            {s.meta.tripName}{day ? ` · day ${day}` : ''}{current ? ` · ${current.city}` : ''}
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setSheet({ entry: null })} className="flex-none rounded-full bg-ac2-soft px-[13px] py-2 text-base font-semibold text-ac2-deep">
            ＋ Entry
          </button>
        )}
      </div>
      <ViewerNotice />
      <SaveError show={mut.isError} error={mut.error} />
      <SaveError show={stateMut.isError} error={stateMut.error} />

      {/* overview */}
      <div className="lv-enter rounded-[var(--r)] bg-sf p-5">
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
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-track">
          <span className="lv-grow block h-full rounded-full bg-ac" style={{ width: pct + '%' }} />
        </div>
        <div className="mt-1.5 flex justify-between gap-3 text-[13px] text-tx2">
          <span className="flex-none">{pct}% of projected</span>
          <span className="text-right">pre-trip estimate <b className="text-warn">{fmt(budget.grand)}</b></span>
        </div>
      </div>

      {canEdit && imp && imp.candidates.length > 0 && autoImport === false && (
        <div className="lv-enter rounded-[var(--r)] bg-sf p-4">
          <div className="text-base font-semibold">Import your {imp.candidates.length} booked cost{imp.candidates.length > 1 ? 's' : ''}?</div>
          <p className="mt-1 text-base leading-normal text-tx2">Booked stays and transport with a charge date can sit in the ledger as “from booking” rows, kept in sync with the Trip page.</p>
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
      <LedgerList entries={ledger} rates={s.rates} base={base} fmt={fmt} tripStart={tripStart} todayIso={today} canEdit={canEdit} onEdit={(e) => setSheet({ entry: e })} />
      <PlanCard plan={plan} transport={bookings.transport} projection={projection} state={s} fmt={fmt} todayIso={today} unbooked={bookings.unbooked} />
      <MonthlyCard state={s} cityIdx={cityIdx} fmt={fmt} />
      <Link href="/settings" className="flex items-center justify-between rounded-[var(--r)] bg-sf px-[18px] py-3.5">
        <span>
          <span className="block text-base font-semibold">{cap > 0 ? 'Budget cap' : 'Set a budget cap'}</span>
          <span className="block text-[13px] text-tx2">
            {cap > 0 ? `${fmt(cap)} · projected uses ${Math.round((projection.projected / cap) * 100)}%` : 'a ceiling for the whole trip, in Settings'}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 text-ac2" />
      </Link>

      {sheet && (
        <EntrySheet
          initial={sheet.entry}
          ledger={ledger}
          rates={s.rates}
          defaultCur={lastCur}
          onSave={save}
          onDelete={sheet.entry ? del : undefined}
          onClose={() => setSheet(null)}
        />
      )}
    </main>
  )
}
