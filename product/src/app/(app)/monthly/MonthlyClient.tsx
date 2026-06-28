'use client'
import { useMemo } from 'react'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { monthlyBuckets } from '@/lib/trips/budget'
import { fmtHUF, toHUF, monthLabel, monthShort } from '@/lib/trips/format'
import { Stat } from '@/components/trips/Stat'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'

export default function MonthlyClient() {
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
      .reduce((a, e) => a + toHUF(e.amount, e.cur, s.rates), 0)
    const recMonthly = (totalNights ? (totA + totL) / totalNights : 0) * 365 / 12
    const allInMonthly = (totalNights ? (totA + totL + totT) / totalNights : 0) * 365 / 12
    const max = order.reduce((m, k) => Math.max(m, M[k].accom + M[k].live + M[k].transport), 0)
    return { s, M, order, totalNights, totA, totL, totT, extrasTotal, recMonthly, allInMonthly, max }
  }, [trip.data, cityIdx])

  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data || !view) return <CreateTripEmptyState />
  const v = view

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Monthly spending</h1>
      <p className="mb-4 text-sm text-neutral-500">
        How much cash goes out each calendar month, so you can set an earning target. Rent &amp; daily
        living are spread across each stay&apos;s nights; flights land in the month they happen.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat k="Earn target / month" v={fmtHUF(v.recMonthly)} sub={'~$' + Math.round(v.recMonthly / v.s.rates.USD) + ' — rent + daily living'} />
        <Stat k="All-in / month" v={fmtHUF(v.allInMonthly)} sub={'~$' + Math.round(v.allInMonthly / v.s.rates.USD) + ' — incl. flights'} />
        <Stat k="One-off costs (upfront)" v={fmtHUF(v.extrasTotal)} sub="insurance, gear, visas" />
      </div>

      {!v.order.length ? (
        <p className="mt-6 text-sm text-neutral-500">No in-plan stops with nights yet.</p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="py-1 pr-4">Month</th>
                  <th className="pr-4">Nights</th>
                  <th className="pr-4">Rent</th>
                  <th className="pr-4">Daily living</th>
                  <th className="pr-4">Flights</th>
                  <th>Month total</th>
                </tr>
              </thead>
              <tbody>
                {v.order.map((k) => {
                  const b = v.M[k]
                  const mt = b.accom + b.live + b.transport
                  return (
                    <tr key={k} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className="py-1 pr-4 font-medium">{monthLabel(k)}</td>
                      <td className="pr-4">{b.nights}</td>
                      <td className="pr-4">{fmtHUF(b.accom)}</td>
                      <td className="pr-4">{fmtHUF(b.live)}</td>
                      <td className="pr-4">{b.transport ? fmtHUF(b.transport) : '—'}</td>
                      <td className="font-semibold">{fmtHUF(mt)}</td>
                    </tr>
                  )
                })}
                <tr className="border-t border-neutral-300 dark:border-neutral-700 font-semibold">
                  <td className="py-1 pr-4">Total</td>
                  <td className="pr-4">{v.totalNights}</td>
                  <td className="pr-4">{fmtHUF(v.totA)}</td>
                  <td className="pr-4">{fmtHUF(v.totL)}</td>
                  <td className="pr-4">{fmtHUF(v.totT)}</td>
                  <td>{fmtHUF(v.totA + v.totL + v.totT)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="mb-2 mt-6 text-lg font-semibold">Monthly cash-out</h2>
          <div className="space-y-1">
            {v.order.map((k) => {
              const b = v.M[k]
              const mt = b.accom + b.live + b.transport
              return (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 text-neutral-500">{monthShort(k)}</span>
                  <div className="h-3 flex-1 rounded bg-neutral-100 dark:bg-neutral-900">
                    <span className="block h-3 rounded bg-teal-500" style={{ width: (v.max ? (mt / v.max) * 100 : 0) + '%' }} />
                  </div>
                  <span className="w-28 shrink-0 text-right">{fmtHUF(mt)}</span>
                </div>
              )
            })}
          </div>

          <div className="mt-4 rounded-lg border border-neutral-200 p-3 text-sm text-neutral-500 dark:border-neutral-800">
            <b>Earning target:</b> aim to earn at least <b>{fmtHUF(v.recMonthly)}/month</b> (~$
            {Math.round(v.recMonthly / v.s.rates.USD)}) between you to cover day-to-day costs. The{' '}
            {fmtHUF(v.extrasTotal)} of one-off costs sit on top — ideally saved before you go, or ~
            {fmtHUF(v.order.length ? v.extrasTotal / v.order.length : 0)}/month.
          </div>
        </>
      )}
    </main>
  )
}
