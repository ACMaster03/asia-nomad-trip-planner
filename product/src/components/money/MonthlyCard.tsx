'use client'
import { fmtAmount, monthShort } from '@/lib/trips/format'
import type { MonthToEarn } from '@/lib/trips/spending'

// "What you need to earn" — one number: the average month still ahead.
//
// Fourth shape, and the first three are why this one is a single figure.
// Projected outflow in stacked category bars captioned "what has to come in",
// which reversed the direction of every number under it. Then a spent/earned/
// net table of what had actually happened, accurate and not the question being
// asked. Then the average with a row per month under it, each row naming the
// nights behind its number.
//
// The rows were cut on 2026-09-20: "too much info in a small place, and
// honestly we are not sure we need a table like this". Cut on that ground and
// not on accuracy, which matters if it is ever reopened - the argument against
// them had been "those numbers could be wrong because we cannot know how much
// we spend", and that is only a quarter true. FOUR of the five terms in a
// month are facts: ledger rows already dated into it, stays on their charge
// date, booked fares, subscriptions due. Only the nights still ahead are
// projected. The average is those same five terms summed and divided, so it
// carries identical uncertainty - the rows were never the uncertain part.
//
// WHAT THE CUT COSTS, so nobody rediscovers it as a bug. The average is the
// only figure left, and no month looks like it: on this trip October needs
// 1 405 636 against December's 133 254, ten to one. Earning the average every
// month would leave you 600k short in October and well over in December. The
// card no longer says so anywhere. If that ever bites, the cheap fix is one
// line naming the range rather than the table coming back - monthlyToEarn()
// still returns every month and its amount, and only this component stopped
// reading them.
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
  /** the trip's base currency; named once, beside the figure */
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

      <p className="mt-3 border-t border-ln pt-3 text-[13px] leading-normal text-tx2">
        Your booked stays, fares and subscriptions, plus the nights still ahead at the rate you
        have actually been spending. This month counts only what is still to come, not what has
        already gone out.
        {plannedExtras > 0 && (
          <> Planned one-offs ({amt(plannedExtras)} {base}) are not in here, because they carry no
          date to land on; they are on the One-offs card above.</>
        )}
      </p>
    </div>
  )
}
