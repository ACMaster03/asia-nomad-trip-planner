'use client'
import { useMemo } from 'react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { monthlyBuckets } from '@/lib/trips/budget'
import { toBase, monthShort } from '@/lib/trips/format'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'

// Money · Monthly (handoff frame 17). Structure: earn-target hero → month
// bars (label · bar · total per calendar month) → earning-target note. The
// buckets themselves are unchanged — rent/daily spread across nights,
// flights in the month they happen.

export function MonthlyTab() {
  const { fmt } = useMoney()
  const { trip, cityIdx } = useTripScreen()

  const view = useMemo(() => {
    if (!trip.data) return null
    const s = trip.data.state
    const { M, order } = monthlyBuckets(s, cityIdx)
    let totalNights = 0, totA = 0, totL = 0, totT = 0
    order.forEach((k) => {
      totalNights += M[k].nights
      totA += M[k].accom
      totL += M[k].live
      totT += M[k].transport
    })
    const extrasTotal = s.extras
      .filter((e) => e.include)
      .reduce((a, e) => a + toBase(e.amount, e.cur, s.rates), 0)
    const recMonthly = (totalNights ? (totA + totL) / totalNights : 0) * 365 / 12
    const allInMonthly = (totalNights ? (totA + totL + totT) / totalNights : 0) * 365 / 12
    const max = order.reduce((m, k) => Math.max(m, M[k].accom + M[k].live + M[k].transport), 0)
    return { s, M, order, totalNights, totA, totL, totT, extrasTotal, recMonthly, allInMonthly, max }
  }, [trip.data, cityIdx])

  if (trip.isPending) return <main className="mx-auto max-w-xl p-6">Loading…</main>
  if (!trip.data || !view) return <CreateTripEmptyState />
  const v = view

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px] text-tx">
      <div>
        <h1 className="font-serif text-[25px] font-semibold leading-[1.15] tracking-[-.01em]">Monthly</h1>
        <p className="mt-1 text-base leading-normal text-tx2">
          What has to come in each month. Rent and daily living spread across a stay&apos;s nights; flights land in the
          month they happen.
        </p>
      </div>

      {/* hero — the earn target */}
      <div className="lv-enter rounded-[var(--r)] bg-sf p-5">
        <div className="text-base font-medium uppercase tracking-[.11em] text-tx2">Earn target / month</div>
        <div className="mt-1 text-[32px] font-semibold leading-[1.1] tracking-[-.02em]">{fmt(v.recMonthly)}</div>
        <p className="mt-1.5 text-base text-tx2">rent + daily living, before flights</p>
        <div className="mt-3.5 border-t border-ln pt-3.5">
          <div className="flex justify-between gap-3 text-base">
            <span className="text-tx2">All-in with flights</span>
            <span className="font-semibold">{fmt(v.allInMonthly)}</span>
          </div>
          <div className="mt-2 flex justify-between gap-3 text-base">
            <span className="text-tx2">One-off costs upfront</span>
            <span className="font-semibold">{fmt(v.extrasTotal)}</span>
          </div>
        </div>
      </div>

      {!v.order.length ? (
        <p className="text-base text-tx2">No in-plan stops with nights yet.</p>
      ) : (
        <>
          {/* month bars */}
          <div className="lv-enter rounded-[var(--r)] bg-sf p-5">
            <div className="flex flex-col gap-3">
              {v.order.map((k, i) => {
                const b = v.M[k]
                const mt = b.accom + b.live + b.transport
                return (
                  <div key={k} className="flex items-center gap-3">
                    <span className="w-[58px] flex-none text-base text-tx2">{monthShort(k)}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-fill2">
                      <div
                        className="lv-grow h-full rounded-full bg-ac"
                        style={{ width: Math.round((v.max ? mt / v.max : 0) * 100) + '%', animationDelay: `${i * 0.06}s` }}
                      />
                    </div>
                    <span className="flex-none text-right text-base font-semibold">{fmt(mt)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-[var(--r)] bg-tag px-4 py-3.5 text-base leading-normal text-tag-ink">
            <b>Earning target:</b> aim to earn at least <b>{fmt(v.recMonthly)}/month</b> between you to cover
            day-to-day costs. The {fmt(v.extrasTotal)} of one-off costs sit on top - ideally saved before you go, or ~
            {fmt(v.order.length ? v.extrasTotal / v.order.length : 0)}/month.
          </div>
        </>
      )}
    </main>
  )
}
