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
// So: a headline average, and the months under a line that says what they are.
//
// The rows were nearly cut. An unlabelled number beside "Oct" could have been
// anything, and the objection raised was "those numbers could be wrong because
// we cannot know for sure how much money we spend". Half right, and the half
// that is wrong is worth writing down because it will come round again: FOUR of
// the five terms in a month are facts rather than guesses - ledger rows already
// dated into it, stays on their charge date, booked fares, and subscriptions
// due. Only the nights still ahead are projected, at the rate actually being
// spent. And the average is those same five terms summed and divided, so it
// carries identical uncertainty; cutting the rows would have removed
// visibility, not error.
//
// It would also have removed the only warning that the months are nothing like
// each other. On this trip October needs 1 405 636 against December's 133 254,
// ten to one, and nobody earns an average. So the rows stay, the caption says
// they are uneven before you read them, and a line at the foot answers where
// any of it comes from.
//
// The arithmetic is monthlyToEarn(), which excludes months already gone and
// nets the current month against what has already left it.

/**
 * "12 nights in Hanoi, 5 in Da Nang". The unit is said once and then implied,
 * and it pluralises, because a handover day leaves exactly one night in the
 * month you arrive in: the real trip's September reads "29 nights in Bangkok,
 * 1 in Hanoi" and August, before it, was a single night.
 * because repeating "nights" for every city is what makes these lines too long
 * to read on a phone. Three cities at most: beyond that the month is a blur of
 * moving and the exact split stops being the point.
 */
function whereLine(where: { city: string; nights: number }[]): string {
  const shown = where.slice(0, 3)
  const rest = where.length - shown.length
  const parts = shown.map((w, i) =>
    i === 0 ? `${w.nights} night${w.nights === 1 ? '' : 's'} in ${w.city}` : `${w.nights} in ${w.city}`,
  )
  return parts.join(', ') + (rest > 0 ? `, +${rest} more` : '')
}

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

      {/* One month and the rows would only repeat the headline. */}
      {months.length > 1 && (
        <div className="mt-3">
          <div className="text-[13px] text-tx3">
            Not evenly spread &mdash; what each month needs on its own
          </div>
          <div className="mt-1 flex flex-col">
            {months.map((m) => (
              <div key={m.key} className="border-t border-ln py-[7px] text-[13px]">
                <div className="flex items-baseline justify-between gap-3 tabular-nums">
                  <span className="text-tx2">{monthShort(m.key).slice(0, 3)}</span>
                  <span className="font-semibold">{amt(m.amount)}</span>
                </div>
                {/* Where the month goes, on its own line. October is expensive
                    because of the nights in it, and the number means nothing
                    without them. */}
                {m.where.length > 0 && (
                  <div className="text-[13px] leading-snug text-tx3">{whereLine(m.where)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
