'use client'
import { fmtAmount, monthShort } from '@/lib/trips/format'
import type { MonthToEarn } from '@/lib/trips/spending'

// "What you need to earn" — the months still ahead, and the average across
// them.
//
// Third shape in a day, and the previous two are why this one is so plain.
// It began as projected outflow in stacked category bars captioned "what has to
// come in", which reversed the direction of every number under it. It then
// became a spent/earned/net table of what had actually happened, which was
// accurate and still not the question being asked. The question is: how much do
// we have to bring in, from here?
//
// So: one headline, one line per remaining month, no bars, no legend, no
// categories. The split into Stays and Transport is answered by Plan by stop
// and by Where it goes; repeating it here only ever made the card harder to
// read.
//
// The arithmetic is monthlyToEarn(), which excludes months already gone and
// nets the current month against what has already left it.

export function MonthlyCard({
  months,
  average,
  total,
  plannedExtras,
  base,
}: {
  months: MonthToEarn[]
  average: number
  total: number
  /** planned one-offs: named, not counted, because they carry no date */
  plannedExtras: number
  /** the trip's base currency; named once, not in every row */
  base: string
}) {
  if (!months.length) return null
  const amt = (n: number) => fmtAmount(n, base)
  const first = monthShort(months[0].key).slice(0, 3)

  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf p-[18px] text-tx">
      <div className="flex items-baseline justify-between gap-3">
        <span className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">
          What you need to earn
        </span>
        <span className="whitespace-nowrap text-[13px] text-tx3">still ahead</span>
      </div>

      <div className="mt-0.5 text-[22px] font-semibold">
        ≈ {amt(average)} {base}
        <span className="text-[15px] font-medium text-tx2"> a month</span>
      </div>
      <div className="mt-1 text-[13px] text-tx2">
        {amt(total)} {base} over {months.length} {months.length === 1 ? 'month' : 'months'}, from{' '}
        {first}.
      </div>

      {/* One month and the rows would just repeat the headline. */}
      {months.length > 1 && (
        <div className="mt-3 flex flex-col">
          {months.map((m) => (
            <div
              key={m.key}
              className="flex items-baseline justify-between gap-3 border-t border-ln py-[7px] text-[13px] tabular-nums"
            >
              <span className="text-tx2">{monthShort(m.key).slice(0, 3)}</span>
              <span className="font-semibold">{amt(m.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-2.5 text-[13px] leading-normal text-tx2">
        This month counts only what is still to come, not what has already gone out.
        {plannedExtras > 0 && (
          <> Planned one-offs ({amt(plannedExtras)} {base}) are not in here, because they carry no
          date to land on; they are on the One-offs card above.</>
        )}
      </p>
    </div>
  )
}
