'use client'
import { useMemo, useState } from 'react'
import { dailySpend, everydayOnly } from '@/lib/trips/spending'
import { GROUPS, GROUP_ORDER, groupOf, categoryLabel } from '@/lib/trips/categories'
import { toBase } from '@/lib/trips/format'
import type { LedgerEntry } from '@/lib/trips/types'

// Daily spend — stacked bars per calendar day, everyday categories only,
// coloured by the five families. 7/14/30/90-day window, ‹ › pages back
// through the trip, tap a bar to open that day underneath. Days before the
// trip start are drawn neutral and excluded from the average.

export type Range = 7 | 14 | 30 | 90
export const RANGES: Range[] = [7, 14, 30, 90]

const W = 354, H = 150, X0 = 4, X1 = 350, BASE = 128, TOP = 34
const shortDay = (iso: string, withWeekday = false) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', withWeekday ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' })

export function DailySpendChart({
  ledger, rates, from, to, todayIso, tripStart, range, onRange, onPage, canBack, canFwd, fmt, onShowDay,
}: {
  ledger: LedgerEntry[]
  rates: Record<string, number>
  from: string
  to: string
  todayIso: string
  tripStart?: string
  range: Range
  onRange: (r: Range) => void
  onPage: (dir: -1 | 1) => void
  canBack: boolean
  canFwd: boolean
  fmt: (n: number) => string
  onShowDay: (date: string) => void
}) {
  const [sel, setSel] = useState<string | null>(null)
  const days = useMemo(() => dailySpend(everydayOnly(ledger), rates, { from, to }), [ledger, rates, from, to])
  const n = days.length
  const inTrip = (d: string) => !tripStart || d >= tripStart
  const avgDays = days.filter((d) => inTrip(d.date))
  const avg = (avgDays.length ? avgDays : days).reduce((a, d) => a + d.total, 0) / Math.max(1, (avgDays.length ? avgDays : days).length)
  const max = Math.max(1, ...days.map((d) => d.total), avg)
  const slot = (X1 - X0) / Math.max(1, n)
  const barW = Math.max(2, slot * (n <= 14 ? 0.72 : 0.8))
  const y = (v: number) => BASE - (v / max) * (BASE - TOP)
  const labelEvery = range === 7 ? 1 : range === 14 ? 4 : range === 30 ? 7 : 0
  const startIdx = tripStart ? days.findIndex((d) => d.date === tripStart) : -1

  const dayEntries = useMemo(() => {
    if (!sel) return []
    return ledger
      .filter((e) => e.date === sel && e.type === 'expense')
      .map((e) => ({ e, base: toBase(e.amount, e.currency, rates) }))
      .sort((a, b) => b.base - a.base)
  }, [ledger, rates, sel])
  const dayTotal = dayEntries.reduce((a, r) => a + r.base, 0)

  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf p-[18px] text-tx">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">Daily spend</span>
        {/* The average sits up here, where no bar can cover it (#66; mock 16 §4). It
            replaces the day numbers, which the range under the bars already gives. */}
        <span className="text-[12px] text-tx3">
          {shortDay(from)} – {shortDay(to)}
          {n > 0 && <> · avg {fmt(avg)} a day</>}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button onClick={() => onPage(-1)} disabled={!canBack} aria-label="Earlier" className="flex size-[34px] items-center justify-center rounded-full border-[1.5px] border-ln2 text-tx2 disabled:opacity-35">‹</button>
        <div className="flex flex-1 rounded-[14px] border-[1.5px] border-ln2 bg-inp p-[3px]" role="radiogroup" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r} role="radio" aria-checked={range === r} onClick={() => onRange(r)} className={'flex-1 rounded-[11px] py-1.5 text-[13px] font-semibold ' + (range === r ? 'bg-sf text-tx shadow-sm' : 'text-tx2')}>
              {r}d
            </button>
          ))}
        </div>
        <button onClick={() => onPage(1)} disabled={!canFwd} aria-label="Later" className="flex size-[34px] items-center justify-center rounded-full border-[1.5px] border-ln2 text-tx2 disabled:opacity-35">›</button>
      </div>

      {n === 0 ? (
        <p className="mt-3 text-base text-tx2">Nothing logged in this window yet.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-1.5 block w-full" role="img" aria-label={`Daily spend from ${from} to ${to}`}>
          <line x1={0} x2={W} y1={y(avg)} y2={y(avg)} stroke="var(--ln2)" strokeDasharray="3 3" />
          {startIdx > 0 && (
            <>
              <line x1={X0 + startIdx * slot} x2={X0 + startIdx * slot} y1={TOP - 4} y2={BASE} stroke="var(--ac2)" strokeWidth={1.5} strokeDasharray="4 3" />
              <text x={X0 + startIdx * slot + 4} y={TOP - 6} fontSize={9} fontWeight={600} fill="var(--ac2)">TRIP STARTS · {shortDay(tripStart!).toUpperCase()}</text>
            </>
          )}
          {days.map((d, i) => {
            const x = X0 + i * slot + (slot - barW) / 2
            const pre = !inTrip(d.date)
            let top = BASE
            const stacks = pre
              ? [{ g: 'pre', v: d.total, color: 'var(--tr)' }]
              : GROUP_ORDER.map((g) => ({
                  g, color: GROUPS[g].color,
                  v: Object.entries(d.byCategory).filter(([c]) => groupOf(c) === g).reduce((a, [, v]) => a + v, 0),
                })).filter((s) => s.v > 0)
            const isSel = sel === d.date
            const isToday = d.date === todayIso
            // the last day always gets a label; a regular one that would sit
            // right next to it is skipped so "12 Sep" never collides with "today"
            const show = labelEvery
              ? i === n - 1 || (i % labelEvery === 0 && (labelEvery === 1 || n - 1 - i >= 2))
              : d.date.endsWith('-01')
            return (
              <g key={d.date} onClick={() => setSel(isSel ? null : d.date)} style={{ cursor: 'pointer' }}>
                <rect x={X0 + i * slot} y={TOP - 4} width={slot} height={BASE - TOP + 4} fill="transparent" />
                {stacks.map((s) => {
                  const h = (s.v / max) * (BASE - TOP)
                  top -= h
                  return <rect key={s.g} x={x} y={top} width={barW} height={h} fill={s.color} />
                })}
                {isSel && <rect x={x - 2} y={TOP - 2} width={barW + 4} height={BASE - TOP + 4} fill="none" stroke="var(--tx)" strokeWidth={1.5} rx={3} />}
                {show && (
                  <text x={X0 + i * slot + slot / 2} y={H - 7} fontSize={10} textAnchor="middle" fontWeight={isSel || isToday ? 600 : 400} fill={isToday ? 'var(--ac2)' : isSel ? 'var(--tx)' : 'var(--tx3)'}>
                    {isToday ? 'today' : range === 90 ? new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' }) : shortDay(d.date, range === 7)}
                  </text>
                )}
              </g>
            )
          })}
          <line x1={0} x2={W} y1={BASE + 0.5} y2={BASE + 0.5} stroke="var(--ln2)" />
        </svg>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12px] text-tx2">
        {startIdx > 0 && <span><i className="mr-1.5 inline-block size-2.5 rounded-[3px] align-[-1px]" style={{ background: 'var(--tr)' }} />Before the trip</span>}
        {GROUP_ORDER.filter((g) => g !== 'other').map((g) => (
          <span key={g}><i className="mr-1.5 inline-block size-2.5 rounded-[3px] align-[-1px]" style={{ background: GROUPS[g].color }} />{GROUPS[g].label}</span>
        ))}
      </div>

      {sel && (
        <div className="mt-3 border-t border-ln">
          <div className="flex items-baseline justify-between pt-3 text-[12px] font-semibold uppercase tracking-[.09em] text-tx3">
            <span>{new Date(sel + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}</span>
            <b className="text-[14px] normal-case tracking-normal text-tx2">{fmt(dayTotal)}</b>
          </div>
          {dayEntries.length === 0 && <p className="py-2.5 text-base text-tx2">Nothing spent that day.</p>}
          {dayEntries.slice(0, 3).map(({ e, base }) => (
            <div key={e.id} className="flex items-start justify-between gap-3 border-t border-ln py-2.5 first:border-t-0">
              <span className="min-w-0"><span className="block text-base font-semibold">{e.note?.trim() || categoryLabel(e.category)}</span><span className="block text-[14px] text-tx2">{categoryLabel(e.category)}</span></span>
              <span className="flex-none text-right"><span className="block text-base font-semibold">{fmt(base)}</span>{e.currency !== undefined && rates[e.currency] !== 1 && <span className="block text-[13px] text-tx2">{e.amount.toLocaleString('en-US')} {e.currency}</span>}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-ln pt-2.5">
            <button onClick={() => setSel(null)} className="min-h-11 text-[13px] text-tx3">tap the bar again to close</button>
            {dayEntries.length > 0 && (
              <button onClick={() => onShowDay(sel)} className="min-h-11 text-base font-semibold text-ac2-deep">Show all {dayEntries.length} in the ledger ›</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
