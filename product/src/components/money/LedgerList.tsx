'use client'
import { useMemo } from 'react'
import { categoryLabel } from '@/lib/trips/categories'
import { toBase, monthLabel } from '@/lib/trips/format'
import type { LedgerEntry } from '@/lib/trips/types'

// The ledger — one continuous list, newest first. Month separators (mauve)
// and day separators both carry their total; a mauve band marks where the
// trip starts, so what came before it (flights, gear, e-SIM) is visibly a
// different chapter. Rows are the tap target for editing.
//
// Rows dated after today sit above a "Today" band and are drawn faded: a
// booked stay's charge date or a fare still to be taken is a real cost on a
// real day, so the calendar shows it — but the overview counts it as
// SCHEDULED, not as spend (lib/trips/spending.ts, projectFromPlan).

const dayLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const shortDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function LedgerList({ entries, rates, base, fmt, tripStart, todayIso, canEdit, onEdit }: {
  entries: LedgerEntry[]
  rates: Record<string, number>
  base: string
  fmt: (n: number) => string
  tripStart?: string
  todayIso: string
  canEdit: boolean
  onEdit: (e: LedgerEntry) => void
}) {
  const sorted = useMemo(() => entries.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [entries])
  const { byMonth, byDay, preCount, preTotal, aheadCount, aheadTotal } = useMemo(() => {
    const byMonth: Record<string, number> = {}
    const byDay: Record<string, number> = {}
    let preCount = 0, preTotal = 0, aheadCount = 0, aheadTotal = 0
    for (const e of sorted) {
      if (e.type !== 'expense') continue
      const v = toBase(e.amount, e.currency, rates)
      byMonth[e.date.slice(0, 7)] = (byMonth[e.date.slice(0, 7)] ?? 0) + v
      byDay[e.date] = (byDay[e.date] ?? 0) + v
      if (tripStart && e.date < tripStart) { preCount++; preTotal += v }
      if (e.date > todayIso) { aheadCount++; aheadTotal += v }
    }
    return { byMonth, byDay, preCount, preTotal, aheadCount, aheadTotal }
  }, [sorted, rates, tripStart, todayIso])
  const hasPre = !!tripStart && sorted.some((e) => e.date < tripStart) && sorted.some((e) => e.date >= tripStart)
  // Only worth a divider when there is something on BOTH sides of today.
  const hasAhead = aheadCount > 0 && sorted.some((e) => e.date <= todayIso)

  if (!sorted.length) {
    return (
      <div className="rounded-[var(--r)] bg-sf px-[18px] py-4 text-base text-tx2">
        {canEdit ? 'Nothing logged yet. Tap ＋ Entry to add the first one. Booked stays and flights arrive here on their charge date.' : 'Nothing logged yet.'}
      </div>
    )
  }

  return (
    <div className="rounded-[var(--r)] bg-sf px-[18px] pb-2 pt-1.5 text-tx">
      <div className="flex items-center justify-between border-b border-ln py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">Ledger</span>
        {canEdit && <span className="text-[13px] text-tx3">tap a row to edit</span>}
      </div>
      {sorted.map((e, i) => {
        const prev = sorted[i - 1]
        const newMonth = !prev || prev.date.slice(0, 7) !== e.date.slice(0, 7)
        const newDay = !prev || prev.date !== e.date
        const crossesStart = hasPre && !!prev && prev.date >= tripStart! && e.date < tripStart!
        const crossesToday = hasAhead && !!prev && prev.date > todayIso && e.date <= todayIso
        const ahead = e.date > todayIso
        const isInc = e.type !== 'expense'
        const day1 = tripStart && e.date === tripStart
        return (
          <div key={e.id}>
            {i === 0 && ahead && (
              <div className="-mx-[18px] mb-1 mt-2 flex items-center justify-between gap-2 rounded-[12px] border border-dashed border-ln2 px-[18px] py-2.5 text-[13px] font-semibold text-tx2">
                <span>Scheduled · {aheadCount} {aheadCount === 1 ? 'entry' : 'entries'} still to come</span>
                <span className="font-medium text-tx3">{fmt(aheadTotal)} · not counted as spent</span>
              </div>
            )}
            {crossesToday && (
              <div className="-mx-[18px] mt-2 flex items-center justify-center gap-2 rounded-[12px] bg-ac2-soft px-[18px] py-2.5 text-[13px] font-semibold text-ac2-deep">
                <span>▲ Today {shortDay(todayIso)}</span>
                <span className="font-medium text-tx3">· everything above is scheduled, not spent</span>
              </div>
            )}
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
            <div
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
              onClick={canEdit ? () => onEdit(e) : undefined}
              onKeyDown={canEdit ? (ev) => { if (ev.key === 'Enter') onEdit(e) } : undefined}
              className={'flex items-start justify-between gap-3 border-t border-ln py-[11px] ' + (ahead ? 'opacity-60 ' : '') + (canEdit ? 'cursor-pointer' : '')}
            >
              <span className="min-w-0">
                <span className="block text-base font-semibold">{e.note?.trim() || categoryLabel(e.category)}</span>
                <span className="block text-[14px] text-tx2">
                  {categoryLabel(e.category)}
                  {e.source && ' · from booking'}
                  {ahead && ' · scheduled'}
                  {e.orphaned && <span className="text-warn"> · booking removed</span>}
                </span>
              </span>
              <span className="flex-none text-right">
                <span className={'block text-base font-semibold' + (isInc ? ' text-ac' : '')}>{(isInc ? '+' : '') + fmt(toBase(e.amount, e.currency, rates))}</span>
                {e.currency !== base && <span className="block text-[13px] text-tx2">{e.amount.toLocaleString('en-US')} {e.currency}</span>}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
