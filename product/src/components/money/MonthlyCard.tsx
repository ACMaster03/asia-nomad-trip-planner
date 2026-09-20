'use client'
import { fmtAmount, monthShort } from '@/lib/trips/format'
import type { MonthActual } from '@/lib/trips/spending'

// "Month by month" — what went out, what came in, and whether the month ended
// up or down.
//
// This card used to be "To cover the plan": projected outflow per month, split
// into Stays / Daily living / Transport / Subscriptions, captioned "what has to
// come in". Two problems, both reported by a traveller rather than found here
// (2026-09-20). The caption reversed the direction of every number under it —
// the file's own comment said "what has to leave the account" — and the
// forecast it showed was already told better by Plan by stop, which breaks the
// same money down per stop with the arithmetic spelled out.
//
// So it stops forecasting and starts reporting. ACTUALS ONLY: nothing dated
// after today (see monthlyActuals). It also gives the ledger's income rows
// their first appearance anywhere in the app; the Add-entry sheet has offered
// an Income toggle since it was written and nothing ever read those rows back.
//
// WHAT WENT WITH IT: this was the only per-month view of FUTURE money, so
// nothing now says which month the big costs land in. Plan by stop is per stop,
// not per month. Called out rather than lost quietly, in case it is missed.

export function MonthlyCard({
  months,
  spent,
  earned,
  net,
  base,
}: {
  months: MonthActual[]
  spent: number
  earned: number
  net: number
  /** the trip's base currency; named once in the header, not in every cell */
  base: string
}) {
  // One month is not a table. Below that the overview already says what was
  // spent, and a single row would only repeat it with more furniture.
  if (months.length < 2) return null

  // Bare numbers, currency named once above. With "Ft" in all twelve cells the
  // totals row ran into itself at 390px: three columns of seven digits plus a
  // suffix do not fit a phone.
  const money = (n: number) => (n === 0 ? '—' : fmtAmount(n, base))
  const signed = (n: number) => (n > 0 ? `+${fmtAmount(n, base)}` : fmtAmount(n, base))
  const netTone = (n: number) => (n === 0 ? 'text-tx3' : n > 0 ? 'text-ac' : 'text-warn')

  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf p-[18px] text-tx">
      <div className="flex items-baseline justify-between gap-3">
        <span className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">
          Month by month
        </span>
        <span className="text-right text-[13px] text-tx3">what you spent and earned, in {base}</span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[13px] tabular-nums">
          <thead>
            <tr className="text-tx3">
              <th scope="col" className="w-11 pb-1.5 text-left font-medium">
                <span className="sr-only">Month</span>
              </th>
              <th scope="col" className="pb-1.5 text-right font-medium">Spent</th>
              <th scope="col" className="pb-1.5 text-right font-medium">Earned</th>
              <th scope="col" className="pb-1.5 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key} className="border-t border-ln">
                <th scope="row" className="py-[7px] text-left font-medium text-tx2">
                  {monthShort(m.key).slice(0, 3)}
                </th>
                <td className="py-[7px] text-right">{money(m.spent)}</td>
                <td className="py-[7px] text-right">{money(m.earned)}</td>
                <td className={'py-[7px] text-right font-semibold ' + netTone(m.net)}>
                  {m.spent === 0 && m.earned === 0 ? '—' : signed(m.net)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ln3">
              <th scope="row" className="pt-2.5 text-left font-semibold">All</th>
              <td className="pt-2.5 text-right font-semibold">{money(spent)}</td>
              <td className="pt-2.5 text-right font-semibold">{money(earned)}</td>
              <td className={'pt-2.5 text-right font-semibold ' + netTone(net)}>{signed(net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-2.5 text-[13px] leading-normal text-tx2">
        {earned === 0
          ? 'No income logged yet. Add one with the Income tab when you add an entry, and it will show up here.'
          : net >= 0
            ? 'You have brought in more than you have spent so far.'
            : 'You have spent more than you have brought in so far.'}{' '}
        Anything dated later than today is not counted: a scheduled charge has not left yet.
      </p>
    </div>
  )
}
