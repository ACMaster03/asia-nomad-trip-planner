'use client'
import { useMemo } from 'react'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { computeBudget } from '@/lib/trips/budget'
import { fmtHUF, fmtUSD, TIER_LABELS } from '@/lib/trips/format'
import { Stat } from '@/components/trips/Stat'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'

export function BudgetTab() {
  const { trip, cityIdx } = useTripScreen()
  const b = useMemo(
    () => (trip.data ? computeBudget(trip.data.state, cityIdx) : null),
    [trip.data, cityIdx],
  )
  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data || !b) return <CreateTripEmptyState />
  const rates = trip.data.state.rates
  const usd = rates.USD || 1
  const parts: [string, number, string][] = [
    ['Accommodation', b.accom, '#37b3a4'],
    ['Daily living', b.live, '#6c8ccf'],
    ['Transport', b.transport, '#cf8a6c'],
    ['Extras', b.extras, '#e0a13a'],
  ]
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Budget</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Totalled in HUF at your trip&apos;s FX rates. Only items marked in-plan count.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat k="Grand total" v={fmtHUF(b.grand)} sub={'≈ ' + fmtUSD(b.grand / usd)} />
        <Stat k="Accommodation" v={fmtHUF(b.accom)} sub={Math.round((b.accom / b.grand) * 100 || 0) + '% of total'} />
        <Stat k="Daily living" v={fmtHUF(b.live)} sub="food · local transport · activities" />
        <Stat k="Transport" v={fmtHUF(b.transport)} sub="legs marked in-plan" />
        <Stat k="One-off / extras" v={fmtHUF(b.extras)} sub="visas, insurance, gear" />
        <Stat k="Per person" v={fmtHUF(b.perPerson)} sub={(trip.data.state.meta.travelers || 2) + ' travellers'} />
      </div>
      <div className="mt-4 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <b className="text-sm">Where the money goes</b>
        <div className="mt-2 flex h-4 overflow-hidden rounded">
          {parts.map(([label, val, color]) => (
            <span
              key={label}
              title={`${label}: ${fmtHUF(val)}`}
              style={{ width: (b.grand ? (val / b.grand) * 100 : 0) + '%', background: color }}
            />
          ))}
        </div>
      </div>
      <h2 className="mb-2 mt-6 text-lg font-semibold">By stop</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1 pr-4">Stop</th>
              <th className="pr-4">Nights</th>
              <th className="pr-4">Tier</th>
              <th className="pr-4">Accommodation</th>
              <th className="pr-4">Daily living</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {b.perSeg.map((p) => (
              <tr key={p.seg.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1 pr-4 font-medium">{p.seg.city}</td>
                <td className="pr-4">{p.nights}</td>
                <td className="pr-4">{TIER_LABELS[p.tier] ?? p.tier}</td>
                <td className="pr-4">
                  {fmtHUF(p.accom)}{' '}
                  <span className="text-xs text-neutral-500">
                    {p.accomSrc === 'included' ? 'included stay' : p.accomSrc === 'estimate' ? 'estimate' : 'no data'}
                  </span>
                </td>
                <td className="pr-4">{fmtHUF(p.live)}</td>
                <td className="font-semibold">{fmtHUF(p.total)}</td>
              </tr>
            ))}
            <tr className="border-t border-neutral-300 dark:border-neutral-700">
              <td colSpan={5} className="py-1 pr-4 text-right font-semibold">Stops subtotal</td>
              <td className="font-semibold">{fmtHUF(b.accom + b.live)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  )
}
