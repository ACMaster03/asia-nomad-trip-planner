'use client'
import { ChevronRight, Plus } from 'lucide-react'
import { isBookedStatus } from '@/lib/trips/commitment'
import { stayTotal, toBase } from '@/lib/trips/format'
import { stayCounts, stayMoneyState, stayName, stopCoverage, type NightRange } from '@/lib/trips/timeline'
import type { Segment, Stay, TripState } from '@/lib/trips/types'
import { fmtDay } from './sheetKit'
import { TONE } from './LegStrip'

// A stop's stays and its warnings (the phone's StayList): on the timeline's
// card the short form (name, nights, price), on the stop page the detailed
// one, with how each stay is paid, a chevron, each row opening its form, and
// "+ Add stay" at the end. Lines sit only between rows.

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : one + 's'}`

export function StayRows({ seg, state, todayIso, fmt, inPlan, detailed = false, canEdit = false, onStay }: {
  seg: Segment
  state: TripState
  todayIso: string
  fmt: (n: number) => string
  inPlan: boolean
  /** the stop page's version: the payment line, a chevron, rows that open */
  detailed?: boolean
  canEdit?: boolean
  /** a row tapped (the stop page): the stay, or the nights to fill in for a new one */
  onStay?: (stay: Stay | null, range: NightRange | null) => void
}) {
  const stays = state.stays.filter((x) => x.segId === seg.id)
  const cov = stopCoverage(seg, stays)
  const uncounted = stays.filter((x) => !stayCounts(x))
  const taps = detailed && canEdit && !!onStay
  const rowCls = 'flex w-full items-center justify-between gap-3 py-2.5 text-left'
  const row = (key: string, onTap: (() => void) | undefined, className: string, children: React.ReactNode) =>
    taps && onTap
      ? <button key={key} type="button" onClick={onTap} className={rowCls + ' ' + className}>{children}</button>
      : <div key={key} className={rowCls + ' ' + className}>{children}</div>
  const chevron = taps ? <ChevronRight aria-hidden className="size-[13px] flex-none text-tx3" strokeWidth={2.6} /> : null
  return (
    <div className="divide-y divide-ln">
      {cov.covered.map(({ stay, range }) => {
        const money = stayMoneyState(stay, todayIso)
        const total = toBase(stayTotal(stay, seg), stay.cur, state.rates)
        return row(stay.id, () => onStay?.(stay, null), '', (
          <>
            <span className="min-w-0">
              <span className="block truncate text-base font-medium">{stayName(stay, seg)}</span>
              <span className="block text-[13px] text-tx2">
                {fmtDay(range.from)} – {fmtDay(range.to)} · {plural(range.nights, 'night')}
                {!detailed && <> · <span className={TONE[money.tone]}>{money.label}</span></>}
                {/* A stop out of the plan still owes its booked stays (#105): Money counts them until cancelled. */}
                {!inPlan && isBookedStatus(stay.status) && <span className="text-warn"> · still in Bookings</span>}
              </span>
              {detailed && <span className={'block text-[13px] font-medium ' + TONE[money.tone]}>{money.label[0].toUpperCase() + money.label.slice(1)}</span>}
            </span>
            <span className="flex flex-none items-center gap-2">
              {total > 0 && <span className="text-base font-semibold tabular-nums">{fmt(total)}</span>}
              {chevron}
            </span>
          </>
        ))
      })}
      {uncounted.map((stay) => row(stay.id, () => onStay?.(stay, null), 'opacity-55', (
        <>
          <span className="min-w-0">
            <span className="block truncate text-base font-medium">{stayName(stay, seg)}</span>
            <span className="block text-[13px] text-tx2">old option · not counted</span>
          </span>
          {chevron}
        </>
      )))}
      {inPlan && cov.gaps.map((g) => row(g.from, () => onStay?.(null, g), 'text-warn', (
        <>
          <span className="text-base font-medium">No bed {fmtDay(g.from)} → {fmtDay(g.to)}</span>
          <span className="text-[13px]">{plural(g.nights, 'night')}</span>
        </>
      )))}
      {cov.overlaps.map((o) => (
        <div key={o.from} className="py-2 text-[13px] font-medium text-warn">
          Two stays overlap {fmtDay(o.from)} – {fmtDay(o.to)} · {plural(o.nights, 'night')} counted twice
        </div>
      ))}
      {!stays.length && row('none', () => onStay?.(null, null), '', (
        <>
          <span className={'text-base font-medium ' + (inPlan ? 'text-warn' : 'text-tx3')}>{inPlan ? 'No stay yet' : 'Nights not counted'}</span>
          {chevron}
        </>
      ))}
      {taps && stays.length > 0 && (
        <button type="button" onClick={() => onStay?.(null, cov.covered.length ? (cov.gaps[0] ?? null) : null)} className="flex min-h-11 w-full items-center gap-2 text-left text-base font-semibold text-ac">
          <Plus aria-hidden className="size-4" strokeWidth={2.6} /> Add stay
        </button>
      )}
    </div>
  )
}
