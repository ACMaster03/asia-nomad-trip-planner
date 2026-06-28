'use client'
import { useMemo } from 'react'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { segNights, regColor, TIER_LABELS } from '@/lib/trips/format'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'

export default function TimelineClient() {
  const { trip, cityIdx } = useTripScreen()

  const stops = useMemo(() => {
    if (!trip.data) return []
    return trip.data.state.segments
      .filter((s) => s.include !== false)
      .slice()
      .sort((a, b) => +new Date(a.arrive) - +new Date(b.arrive))
  }, [trip.data])

  const span = useMemo(() => {
    if (!stops.length) return null
    const min = Math.min(...stops.map((s) => +new Date(s.arrive)))
    const max = Math.max(...stops.map((s) => +new Date(s.depart)))
    return { min, max, total: Math.max(1, max - min) }
  }, [stops])

  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Timeline</h1>
      <p className="mb-4 text-sm text-neutral-500">Your in-plan stops in date order.</p>

      {span && (
        <div className="mb-6 space-y-1">
          {stops.map((s) => {
            const left = ((+new Date(s.arrive) - span.min) / span.total) * 100
            const width = Math.max(((+new Date(s.depart) - +new Date(s.arrive)) / span.total) * 100, 4)
            const color = s.color || regColor(cityIdx[s.city]?.r)
            return (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 truncate text-neutral-500">{s.city}</span>
                <div className="relative h-5 flex-1 rounded bg-neutral-100 dark:bg-neutral-900">
                  <span
                    className="absolute top-0 flex h-5 items-center rounded px-2 text-[11px] font-medium text-white"
                    style={{ left: left + '%', width: width + '%', background: color }}
                    title={`${s.arrive} → ${s.depart}`}
                  >
                    {segNights(s)}n
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1 pr-4">Stop</th>
              <th className="pr-4">Country</th>
              <th className="pr-4">Dates</th>
              <th className="pr-4">Nights</th>
              <th>Tier</th>
            </tr>
          </thead>
          <tbody>
            {stops.map((s) => (
              <tr key={s.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1 pr-4 font-medium">{s.city}</td>
                <td className="pr-4">{s.country}</td>
                <td className="pr-4 whitespace-nowrap">{s.arrive} → {s.depart}</td>
                <td className="pr-4">{segNights(s)}</td>
                <td>{TIER_LABELS[s.tier ?? 1] ?? s.tier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
