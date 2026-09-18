'use client'
import { useMemo, useState } from 'react'
import { spendByCategory, everydayOnly } from '@/lib/trips/spending'
import { GROUPS, GROUP_ORDER, groupOf, categoryLabel } from '@/lib/trips/categories'
import type { LedgerEntry } from '@/lib/trips/types'

// Where it goes — donut by family + a two-column category table for the same
// window as the chart. Everyday categories only: this is the figure the
// per-day rate and every projection are built from.

const R = 44, C = 2 * Math.PI * R

export function WhereItGoes({ ledger, rates, from, to, fmt, rangeLabel }: {
  ledger: LedgerEntry[]
  rates: Record<string, number>
  from: string
  to: string
  fmt: (n: number) => string
  rangeLabel: string
}) {
  const [all, setAll] = useState(false)
  const cats = useMemo(() => spendByCategory(everydayOnly(ledger), rates, { from, to }), [ledger, rates, from, to])
  const total = cats.reduce((a, c) => a + c.total, 0)
  const groups = GROUP_ORDER.map((g) => ({
    g, ...GROUPS[g],
    total: cats.filter((c) => groupOf(c.category) === g).reduce((a, c) => a + c.total, 0),
  })).filter((x) => x.total > 0).sort((a, b) => b.total - a.total)
  const pct = (v: number) => Math.round((v / Math.max(1, total)) * 100)
  const shown = all ? cats : cats.slice(0, 8)
  const rest = cats.slice(8)

  // dash offsets precomputed so render stays pure
  const arcs = groups.reduce<{ g: string; color: string; len: number; offset: number }[]>((acc, x) => {
    const offset = acc.reduce((a, s) => a + s.len, 0)
    return [...acc, { g: x.g, color: x.color, len: (x.total / total) * C, offset }]
  }, [])
  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf p-[18px] text-tx">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">Where it goes · {rangeLabel}</span>
        <span className="text-[12px] text-tx3">everyday costs</span>
      </div>
      {total === 0 ? (
        <p className="mt-3 text-base text-tx2">No everyday spending in this window.</p>
      ) : (
        <>
          <div className="mt-2.5 flex items-center gap-4">
            <svg viewBox="0 0 120 120" width={120} height={120} role="img" aria-label="Share of everyday spending by category family">
              <circle cx={60} cy={60} r={R} fill="none" stroke="var(--tr)" strokeWidth={18} />
              {arcs.map((x) => (
                <circle key={x.g} cx={60} cy={60} r={R} fill="none" stroke={x.color} strokeWidth={18} strokeDasharray={`${x.len} ${C}`} strokeDashoffset={-x.offset} transform="rotate(-90 60 60)" />
              ))}
              <text x={60} y={57} textAnchor="middle" fontSize={14} fontWeight={600} fill="var(--tx)">{fmt(total).replace(/\s?(Ft|USD|\$|€)$/, '')}</text>
              <text x={60} y={71} textAnchor="middle" fontSize={9} fill="var(--tx3)">in {rangeLabel}</text>
            </svg>
            <p className="flex-1 text-[13px] leading-relaxed text-tx2">
              {groups[0] && <><b className="text-tx">{groups[0].label}</b> take {pct(groups[0].total)}%.</>}
              {groups[1] && <> <b className="text-tx">{groups[1].label}</b> {pct(groups[1].total)}%{groups[2] ? `, ${groups[2].label.toLowerCase()} ${pct(groups[2].total)}%` : ''}.</>}
            </p>
          </div>
          <table className="mt-2 w-full border-collapse text-[14px]">
            <tbody>
              {shown.map((c) => (
                <tr key={c.category}>
                  <td className="border-t border-ln py-2"><i className="mr-2 inline-block size-2.5 rounded-[3px] align-[-1px]" style={{ background: GROUPS[groupOf(c.category)].color }} />{categoryLabel(c.category)}</td>
                  <td className="border-t border-ln py-2 text-right font-semibold">{fmt(c.total)}</td>
                </tr>
              ))}
              {!all && rest.length > 0 && (
                <tr onClick={() => setAll(true)} className="cursor-pointer text-tx3">
                  <td className="border-t border-ln py-2">{rest.length} more…</td>
                  <td className="border-t border-ln py-2 text-right">{fmt(rest.reduce((a, c) => a + c.total, 0))}</td>
                </tr>
              )}
              <tr className="font-semibold text-ac2-deep">
                <td className="border-t-[1.5px] border-ln3 py-2">Everyday total</td>
                <td className="border-t-[1.5px] border-ln3 py-2 text-right">{fmt(total)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
      <p className="mt-2 text-[12px] text-tx3">Stays, flights, gear, subscriptions and fees are counted in Bookings and Plan, not here, because they don’t say what a day costs.</p>
    </div>
  )
}
