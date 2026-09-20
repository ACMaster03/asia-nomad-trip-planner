'use client'
import { monthShort } from '@/lib/trips/format'
import type { MonthOut } from '@/lib/trips/spending'

// "To cover the plan" — what has to leave the account each month.
//
// Rebuilt on the LIVE projection (owner decision, 2026-09-19). It used to run
// on monthlyBuckets(): catalogue city averages spread over the nights, summing
// to the pre-trip plan. Once the pre-trip estimate came off the overview, this
// card was the last place on the page where a number invented before departure
// survived — and it disagreed with everything above it by the amount Bangkok
// was coming in under its estimate, with nothing saying which was which.
//
// Now every bar is built from the same terms as projection.projected
// (monthlyOutflow, spending.ts), so the card ends on the figure the overview
// and the Plan card both quote. Four families, and the bar length compares
// months while the segments split each one.
//
// Planned one-offs are deliberately absent: `state.extras` carry no date, they
// were never inside projection.projected either, and choosing a month for a
// visa fee to land in would put back exactly the kind of fiction this rebuild
// took out. The footnote says so and points at the card that does carry them.

const BANDS = [
  { key: 'stays', label: 'Stays', cls: 'bg-ac' },
  { key: 'living', label: 'Daily living', cls: 'bg-cat-daily' },
  { key: 'transport', label: 'Transport', cls: 'bg-ac2' },
  { key: 'subs', label: 'Subscriptions', cls: 'bg-cat-activity' },
] as const

export function MonthlyCard({ months, total, plannedExtras, fmt }: {
  months: MonthOut[]
  total: number
  /** included state.extras — named, not counted (see the note above) */
  plannedExtras: number
  fmt: (n: number) => string
}) {
  if (!months.length) return null
  const max = months.reduce((m, b) => Math.max(m, b.total), 0)
  const peak = months.reduce((m, b) => (b.total > m.total ? b : m), months[0])

  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf p-[18px] text-tx">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">To cover the plan</span>
        <span className="text-[13px] text-tx3">what has to come in</span>
      </div>
      <div className="mt-1 text-[13px] text-tx2">
        Biggest month is <b className="text-tx">{monthShort(peak.key).slice(0, 3)}</b> at {fmt(peak.total)}.
      </div>
      <div className="mt-3 flex flex-col gap-[7px] text-[13px]">
        {months.map((b, i) => (
          <div key={b.key} className="flex items-center gap-2.5">
            <span className="w-11 flex-none text-tx2">{monthShort(b.key).slice(0, 3)}</span>
            <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-track">
              {BANDS.map((band) => {
                const v = b[band.key]
                if (v <= 0) return null
                return (
                  <span
                    key={band.key}
                    className={'lv-grow block h-full ' + band.cls}
                    style={{ width: (max ? (v / max) * 100 : 0) + '%', animationDelay: `${i * 0.05}s` }}
                  />
                )
              })}
            </span>
            <b className="w-[84px] flex-none text-right">{fmt(b.total)}</b>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-tx2">
        {BANDS.map((band) => (
          <span key={band.key} className="flex items-center gap-1.5">
            <i aria-hidden className={'size-2.5 rounded-full ' + band.cls} />
            {band.label}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-ln pt-3 text-base">
        <b>Projected total</b>
        <b>{fmt(total)}</b>
      </div>
      {plannedExtras > 0 && (
        <p className="mt-1.5 text-[13px] text-tx2">
          Planned one-offs ({fmt(plannedExtras)}) are not in these bars — they carry no date to land on. They are on
          the One-offs card above, beside what you have actually paid.
        </p>
      )}
    </div>
  )
}
