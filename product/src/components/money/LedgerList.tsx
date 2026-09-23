'use client'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { categoryLabel } from '@/lib/trips/categories'
import { toBase, monthLabel } from '@/lib/trips/format'
import { ledgerView } from '@/lib/trips/ledgerView'
import type { LedgerEntry } from '@/lib/trips/types'

// The ledger — one continuous list, newest first, on a screen of its own
// (All entries, /money/entries, since 23 Sep). Month separators (mauve) and day separators
// both carry their total; a mauve band marks where the trip starts, so what
// came before it (flights, gear, e-SIM) is visibly a different chapter. Rows
// are the tap target for editing.
//
// The list starts at today, with what you logged. Rows dated after today are
// SCHEDULED, not spent (a booked stay's charge date, a fare still to be
// taken): they fold into one closed line at the top, and no month or day total
// counts them (lib/trips/ledgerView.ts, Petra, 23 Sep).
//
// It starts at twenty rows and pages backwards (#38). This saves render cost
// and scroll length, NOT bandwidth: the ledger is a jsonb column on the trip
// row (01-document-sync.sql) and TRIP_COLS selects it whole with the state, so
// every byte has arrived before this card renders — and the chart, the donut,
// the burn rate and the projection all need the full array anyway. Real
// pagination means moving the ledger into its own table and giving up
// whole-document sync. Every total here is still computed over EVERY row; only
// the rendering is cut.

const dayLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const shortDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

const PAGE = 20

export function LedgerList({ entries, rates, base, fmt, tripStart, todayIso, canEdit, onEdit, reveal }: {
  entries: LedgerEntry[]
  rates: Record<string, number>
  base: string
  fmt: (n: number) => string
  tripStart?: string
  todayIso: string
  canEdit: boolean
  onEdit: (e: LedgerEntry) => void
  /**
   * A day the chart asked for. Carries a counter so tapping the same bar twice
   * still fires, and paging is part of the answer: a day 60 rows down has to be
   * rendered before it can be scrolled to.
   */
  reveal?: { date: string; n: number } | null
}) {
  const view = useMemo(() => ledgerView(entries, rates, todayIso, tripStart), [entries, rates, todayIso, tripStart])
  const { scheduled, scheduledSpend, past, byMonth, byDay, preCount, preTotal } = view
  const [openScheduled, setOpenScheduled] = useState(false)
  const [pages, setPages] = useState(1)
  // How far down the asked-for day sits. DERIVED during render rather than set
  // from an effect: the rows are then already committed when the effect runs,
  // so the scroll finds its target on the first pass and nothing cascades.
  const revealIdx = reveal ? past.findIndex((e) => e.date === reveal.date) : -1
  const shown = Math.max(pages, revealIdx >= 0 ? Math.ceil((revealIdx + 1) / PAGE) : 1) * PAGE
  useEffect(() => {
    if (!reveal) return
    document.getElementById(`day-${reveal.date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [reveal])
  const visible = past.slice(0, shown)
  const hasPre = !!tripStart && past.some((e) => e.date < tripStart) && past.some((e) => e.date >= tripStart)

  if (!entries.length) {
    return (
      <div className="rounded-[var(--r)] bg-sf px-[18px] py-4 text-base text-tx2">
        {canEdit ? 'Nothing logged yet. Tap ＋ on Money to add the first one. Booked stays and flights arrive here on their charge date.' : 'Nothing logged yet.'}
      </div>
    )
  }

  const row = (e: LedgerEntry, sub?: string) => {
    const isInc = e.type !== 'expense'
    return (
      <div
        role={canEdit ? 'button' : undefined}
        tabIndex={canEdit ? 0 : undefined}
        onClick={canEdit ? () => onEdit(e) : undefined}
        onKeyDown={canEdit ? (ev) => { if (ev.key === 'Enter') onEdit(e) } : undefined}
        className={'flex items-start justify-between gap-3 border-t border-ln py-[11px] ' + (canEdit ? 'cursor-pointer' : '')}
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold">{e.note?.trim() || categoryLabel(e.category)}</span>
          <span className="block text-[14px] text-tx2">
            {categoryLabel(e.category)}
            {e.source && (e.source.kind === 'extra' ? ' · from Extras' : ' · from booking')}
            {sub && ` · ${sub}`}
            {e.orphaned && <span className="text-warn">{e.source?.kind === 'extra' ? ' · extra removed' : ' · booking removed'}</span>}
          </span>
        </span>
        <span className="flex-none text-right">
          <span className={'block text-base font-semibold' + (isInc ? ' text-ac' : '')}>{(isInc ? '+' : '') + fmt(toBase(e.amount, e.currency, rates))}</span>
          {e.currency !== base && <span className="block text-[13px] text-tx2">{e.amount.toLocaleString('en-US')} {e.currency}</span>}
        </span>
      </div>
    )
  }

  const n = scheduled.length
  return (
    // No title row: the screen's own title says what it is, and its subtitle
    // says a row can be tapped.
    <div className="rounded-[var(--r)] bg-sf px-[18px] pb-2 pt-1.5 text-tx">
      {n > 0 && (
        <div className="-mx-[18px] mb-1 mt-0.5 rounded-[12px] border border-dashed border-ln2 px-[18px]">
          <button
            type="button"
            onClick={() => setOpenScheduled((o) => !o)}
            aria-expanded={openScheduled}
            className="flex min-h-11 w-full items-center justify-between gap-2 py-2 text-left text-[14px] font-semibold text-tx2"
          >
            <span>
              Scheduled · {n} {scheduledSpend === null ? (n === 1 ? 'entry' : 'entries') : n === 1 ? 'payment' : 'payments'}
              {scheduledSpend !== null && <span className="font-medium text-tx3"> · {fmt(scheduledSpend)}</span>}
            </span>
            <ChevronDown aria-hidden className={'size-4 flex-none text-tx3 transition-transform duration-[180ms]' + (openScheduled ? ' rotate-180' : '')} />
          </button>
          {openScheduled && (
            <div className="pb-2">
              {scheduled.map((e) => <div key={e.id}>{row(e, shortDay(e.date))}</div>)}
              <p className="pt-1 text-[13px] text-tx3">Dated after today, so not counted as spent yet.</p>
            </div>
          )}
        </div>
      )}
      {visible.length === 0 && <p className="py-3 text-base text-tx2">Nothing logged up to today yet.</p>}
      {visible.map((e, i) => {
        const prev = past[i - 1]
        const newMonth = !prev || prev.date.slice(0, 7) !== e.date.slice(0, 7)
        const newDay = !prev || prev.date !== e.date
        const crossesStart = hasPre && !!prev && prev.date >= tripStart! && e.date < tripStart!
        const day1 = tripStart && e.date === tripStart
        return (
          <div key={e.id}>
            {crossesStart && (
              <div className="-mx-[18px] mt-2 flex items-center justify-center gap-2 rounded-[12px] bg-ac2-soft px-[18px] py-2.5 text-[13px] font-semibold text-ac2-deep">
                <span>▲ Trip starts {shortDay(tripStart!)}</span>
                <span className="font-medium text-tx3">· {preCount} {preCount === 1 ? 'entry' : 'entries'} before it, ≈ {fmt(preTotal)}</span>
              </div>
            )}
            {newMonth && (
              <div className="flex items-baseline justify-between pb-0.5 pt-4 text-[12px] font-semibold uppercase tracking-[.09em] text-ac2-deep">
                <span>{monthLabel(e.date.slice(0, 7))}</span>
                <b className="text-[15px] normal-case tracking-normal">{fmt(byMonth[e.date.slice(0, 7)] ?? 0)}</b>
              </div>
            )}
            {newDay && (
              <div id={`day-${e.date}`} className="flex items-baseline justify-between pb-0.5 pt-3 text-[12px] font-semibold uppercase tracking-[.09em] text-tx3 scroll-mt-4">
                <span>{dayLabel(e.date)}{e.date === todayIso ? ' · today' : day1 ? ' · day 1' : ''}</span>
                <b className="text-[14px] normal-case tracking-normal text-tx2">{fmt(byDay[e.date] ?? 0)}</b>
              </div>
            )}
            {row(e)}
          </div>
        )
      })}
      {shown < past.length && (
        <button
          type="button"
          onClick={() => setPages((n) => n + 1)}
          className="mt-2 w-full rounded-[var(--rCtl)] border-[1.5px] border-ln2 py-2.5 text-base font-semibold text-ac2-deep"
        >
          Load {Math.min(PAGE, past.length - shown)} more
        </button>
      )}
      {past.length > 0 && (
        <p className="py-2 text-center text-[13px] text-tx3">
          showing {visible.length} of {past.length}
        </p>
      )}
    </div>
  )
}
