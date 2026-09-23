'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Info } from 'lucide-react'
import { categoryLabel, ONE_OFF_CATEGORIES } from '@/lib/trips/categories'
import { toBase } from '@/lib/trips/format'
import { isSettled } from '@/lib/trips/commitment'
import type { LedgerEntry, TripState } from '@/lib/trips/types'

// One-offs & extras (#39) — the fourth budget family, back on the Money page.
//
// ExtrasTab has been telling people "see {total} in Money" since the merge
// (ExtrasTab.tsx) while `grep extras product/src/components/money/` returned
// nothing. Visas, insurance and gear were inside the number the page compared
// your spending against, with no way to see what they were.
//
// TWO COLUMNS, NEVER ONE TOTAL. Planned is `state.extras` — a forecast. Paid is
// the ledger rows in the one-off categories — money that actually moved. Add
// them together and a planned visa fee plus its own ledger row counts twice.
// The gap between the columns is the interesting number and the card shows it
// by putting them side by side, not by subtracting them into a third figure.
//
// Rows pair by CATEGORY: that is the only join the data actually has, and it
// is the one the picker already writes on both sides.
//
// Mock 16 §3 (2026-09-23): a line under each row says what the paid figure is
// ("backpack · 20 Aug") or that nothing is paid yet, in amber; the total row
// is called Total; the paragraph about the two columns went behind ⓘ (#65).

export function OneOffsCard({ state, ledger, fmt, todayIso }: {
  state: TripState
  ledger: LedgerEntry[]
  fmt: (n: number) => string
  todayIso: string
}) {
  const v = useMemo(() => {
    const rates = state.rates
    const planned: Record<string, number> = {}
    const paid: Record<string, number> = {}
    const last: Record<string, { date: string; note: string }> = {}
    let excluded = 0
    let excludedCount = 0
    for (const e of state.extras) {
      const value = toBase(e.amount, e.cur, rates)
      if (e.include === false) { excluded += value; excludedCount++; continue }
      const cat = e.category || 'other'
      planned[cat] = (planned[cat] ?? 0) + value
    }
    for (const e of ledger) {
      if (e.type !== 'expense' || !e.date || !isSettled(e.date, todayIso)) continue
      if (!ONE_OFF_CATEGORIES.has(e.category)) continue
      paid[e.category] = (paid[e.category] ?? 0) + toBase(e.amount, e.currency, rates)
      if (!last[e.category] || e.date > last[e.category].date) last[e.category] = { date: e.date, note: e.note?.trim() ?? '' }
    }
    const keys = [...new Set([...Object.keys(planned), ...Object.keys(paid)])]
    const rows = keys
      .map((cat) => ({ cat, planned: planned[cat] ?? 0, paid: paid[cat] ?? 0, last: last[cat] }))
      .sort((a, b) => Math.max(b.planned, b.paid) - Math.max(a.planned, a.paid))
    return {
      rows,
      plannedTotal: Object.values(planned).reduce((a, n) => a + n, 0),
      paidTotal: Object.values(paid).reduce((a, n) => a + n, 0),
      excluded,
      excludedCount,
      count: state.extras.filter((e) => e.include !== false).length,
    }
  }, [state, ledger, todayIso])
  const [info, setInfo] = useState(false)

  if (!v.rows.length && !v.excludedCount) {
    return (
      <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] py-4 text-tx">
        <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">One-offs &amp; extras</div>
        <p className="mt-1.5 text-base text-tx2">Visas, insurance, gear: the costs of the whole trip. Add them on the Trip page and they show here beside what you paid.</p>
      </div>
    )
  }
  const shortDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] pb-2 pt-1.5 text-tx">
      <div className="flex items-center justify-between border-b border-ln py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">One-offs &amp; extras</span>
        <button type="button" aria-label="What the two columns mean" aria-expanded={info} onClick={() => setInfo((v) => !v)} className="-my-2 flex size-11 items-center justify-center text-tx3">
          <Info aria-hidden className="size-[18px]" />
        </button>
      </div>
      {info && (
        <p className="border-b border-ln py-2.5 text-[13px] text-tx2">
          Planned is a forecast, paid is a ledger row. The same cost can sit in both columns, so they are never added together.
        </p>
      )}
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 pt-2 text-[12px] font-semibold uppercase tracking-[.09em] text-tx3">
        <span />
        <span className="w-[78px] text-right min-[380px]:w-[86px]">Planned</span>
        <span className="w-[78px] text-right min-[380px]:w-[86px]">Paid</span>
      </div>
      {v.rows.map((r) => (
        <div key={r.cat} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-t border-ln py-2.5">
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold">{categoryLabel(r.cat)}</span>
            {r.paid > 0 && r.last ? (
              <span className="block truncate text-[13px] text-tx2">{r.last.note ? `${r.last.note} · ` : 'paid '}{shortDay(r.last.date)}</span>
            ) : r.planned > 0 ? (
              <span className="block text-[13px] text-warn">nothing paid yet</span>
            ) : null}
          </span>
          <span className="w-[78px] text-right text-base min-[380px]:w-[86px]">{r.planned > 0 ? fmt(r.planned) : <span className="text-tx3">—</span>}</span>
          <span className="w-[78px] text-right text-base font-semibold min-[380px]:w-[86px]">
            {r.paid > 0 ? fmt(r.paid) : <span className="font-normal text-tx3">—</span>}
          </span>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-t-[1.5px] border-ln3 py-2.5">
        <span className="text-base font-semibold">Total</span>
        <b className="w-[78px] text-right text-base min-[380px]:w-[86px]">{fmt(v.plannedTotal)}</b>
        <b className="w-[78px] text-right text-base min-[380px]:w-[86px]">{fmt(v.paidTotal)}</b>
      </div>
      {v.excludedCount > 0 && (
        <p className="border-t border-ln pt-2.5 text-[13px] text-tx2">
          {v.excludedCount === 1 ? 'One extra is' : `${v.excludedCount} extras are`} switched off,
          {' '}{fmt(v.excluded)} that no total here counts.
        </p>
      )}
      <Link href="/itinerary?tab=extras" className="flex items-center justify-between gap-3 border-t border-ln py-2.5">
        <span className="text-base font-semibold text-ac2-deep">Edit extras</span>
        <ChevronRight aria-hidden className="size-5 text-ac2" />
      </Link>
    </div>
  )
}
