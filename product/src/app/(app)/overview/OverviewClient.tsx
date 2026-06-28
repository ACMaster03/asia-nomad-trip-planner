'use client'
import { useEffect, useMemo, useState } from 'react'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { computeBudget, type CityCost } from '@/lib/trips/budget'
import { fmtHUF, fmtUSD } from '@/lib/trips/format'
import { Stat } from '@/components/trips/Stat'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'

export default function OverviewClient() {
  const { trip, cityIdx } = useTripScreen()
  // "next stop" depends on the current clock → compute only after mount to avoid an
  // SSR/hydration mismatch (and the date-only-string UTC vs local off-by-one).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const b = useMemo(
    () => (trip.data ? computeBudget(trip.data.state, cityIdx) : null),
    [trip.data, cityIdx],
  )
  const cheats = useMemo(() => {
    const arr = Object.entries(cityIdx)
      .filter((e): e is [string, CityCost & { allIn: [number, number] }] =>
        Array.isArray(e[1].allIn) && e[1].allIn.length >= 2)
      .map(([city, c]) => ({ city, lo: c.allIn[0], hi: c.allIn[1] }))
      .sort((a, x) => a.lo + a.hi - (x.lo + x.hi))
    return { cheap: arr.slice(0, 5), dear: arr.slice(-4).reverse() }
  }, [cityIdx])

  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data || !b) return <CreateTripEmptyState />

  const s = trip.data.state
  const usd = s.rates.USD || 1
  const cap = s.meta.budgetCap || 0
  const pct = cap ? Math.min(100, (b.grand / cap) * 100) : 0
  const over = cap > 0 && b.grand > cap
  const inPlan = s.segments.filter((x) => x.include !== false)
  const upcoming = mounted
    ? inPlan
        .slice()
        .sort((a, c) => +new Date(a.arrive) - +new Date(c.arrive))
        .find((seg) => new Date(seg.depart) >= new Date())
    : undefined

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">{s.meta.tripName}</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {inPlan.length} stops · {b.totalNights} nights · {s.meta.travelers} travellers
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat k="Grand total" v={fmtHUF(b.grand)} sub={'≈ ' + fmtUSD(b.grand / usd)} />
        <Stat k="Per day" v={fmtHUF(b.perDay)} sub="across all in-plan nights" />
        <Stat k="Per person" v={fmtHUF(b.perPerson)} />
        <Stat k="Stops" v={String(inPlan.length)} sub={b.totalNights + ' nights total'} />
      </div>

      <div className="mt-4 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <div className="mb-1 flex justify-between text-sm">
          <b>Budget cap</b>
          <span className={over ? 'text-red-600' : 'text-neutral-500'}>
            {fmtHUF(b.grand)} / {fmtHUF(cap)}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
          <span
            className="block h-full"
            style={{ width: pct + '%', background: over ? '#e0655c' : '#37b3a4' }}
          />
        </div>
        {over && <div className="mt-1 text-xs text-red-600">Over cap by {fmtHUF(b.grand - cap)}</div>}
      </div>

      {upcoming && (
        <div className="mt-4 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Next / current stop</div>
          <div className="text-lg font-semibold">
            {upcoming.city}, {upcoming.country}
          </div>
          <div className="text-sm text-neutral-500">
            {upcoming.arrive} → {upcoming.depart}
            {cityIdx[upcoming.city] ? ` · ~$${cityIdx[upcoming.city].live[1]}/day (mid)` : ''}
          </div>
          {upcoming.notes && <div className="mt-1 text-sm">{upcoming.notes}</div>}
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <CostList title="Cheapest cities (all-in / day, 2 ppl)" rows={cheats.cheap} />
        <CostList title="Priciest cities" rows={cheats.dear} />
      </div>
    </main>
  )
}

function CostList({ title, rows }: { title: string; rows: { city: string; lo: number; hi: number }[] }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <h3 className="mb-2 text-sm font-bold text-neutral-400">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No catalogue cost data yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.city} className="flex justify-between">
              <span>{r.city}</span>
              <span className="text-neutral-500">${r.lo}–${r.hi}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
