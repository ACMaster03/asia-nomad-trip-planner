'use client'
import { useMemo, useState } from 'react'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { segNights, regColor, TIER_LABELS } from '@/lib/trips/format'
import { SegmentForm } from '@/components/trips/SegmentForm'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import type { Segment } from '@/lib/trips/types'

export default function TimelineClient() {
  const { trip, cities, cityIdx } = useTripScreen()
  const mut = useTripMutation()
  const [modal, setModal] = useState<{ seg: Segment | null } | null>(null)

  const all = useMemo(() => {
    if (!trip.data) return []
    const t = (d: string) => { const n = +new Date(d); return Number.isNaN(n) ? Infinity : n } // bad/empty dates sort last
    return trip.data.state.segments.slice().sort((a, b) => t(a.arrive) - t(b.arrive))
  }, [trip.data])
  const planned = useMemo(() => all.filter((s) => s.include !== false), [all])
  const span = useMemo(() => {
    if (!planned.length) return null
    const min = Math.min(...planned.map((s) => +new Date(s.arrive)))
    const max = Math.max(...planned.map((s) => +new Date(s.depart)))
    return { min, max, total: Math.max(1, max - min) }
  }, [planned])

  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />

  const upsert = (seg: Segment) => {
    mut.mutate((s) => ({
      ...s,
      segments: s.segments.some((x) => x.id === seg.id)
        ? s.segments.map((x) => (x.id === seg.id ? seg : x))
        : [...s.segments, seg],
    }))
    setModal(null)
  }
  const del = (id: string) => {
    if (!confirm('Delete this stop?')) return
    mut.mutate((s) => ({ ...s, segments: s.segments.filter((x) => x.id !== id) }))
  }
  const toggle = (id: string) => {
    mut.mutate((s) => ({
      ...s,
      segments: s.segments.map((x) => (x.id === id ? { ...x, include: x.include === false } : x)),
    }))
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Timeline</h1>
        <button onClick={() => setModal({ seg: null })} className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">
          + Add stop
        </button>
      </div>
      <p className="mb-4 text-sm text-neutral-500">Your stops in date order. Toggle the checkbox to include a stop in the plan &amp; budget.</p>

      {mut.isError && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40">
          Couldn&apos;t save your change — it was rolled back. Please retry.
        </div>
      )}

      {span && (
        <div className="mb-6 space-y-1">
          {planned.map((s) => {
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
              <th className="py-1 pr-2">In plan</th>
              <th className="pr-4">Stop</th>
              <th className="pr-4">Country</th>
              <th className="pr-4">Dates</th>
              <th className="pr-4">Nights</th>
              <th className="pr-4">Tier</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {all.map((s) => {
              const inPlan = s.include !== false
              return (
                <tr key={s.id} className={'border-t border-neutral-200 dark:border-neutral-800 ' + (inPlan ? '' : 'opacity-50')}>
                  <td className="py-1 pr-2">
                    <input type="checkbox" aria-label="Include in plan" checked={inPlan} onChange={() => toggle(s.id)} />
                  </td>
                  <td className="pr-4 font-medium">{s.city}</td>
                  <td className="pr-4">{s.country}</td>
                  <td className="pr-4 whitespace-nowrap">{s.arrive} → {s.depart}</td>
                  <td className="pr-4">{segNights(s)}</td>
                  <td className="pr-4">{TIER_LABELS[s.tier ?? 1] ?? s.tier}</td>
                  <td className="whitespace-nowrap">
                    <button onClick={() => setModal({ seg: s })} className="text-xs text-teal-600 hover:underline">edit</button>
                    <button onClick={() => del(s.id)} className="ml-3 text-xs text-red-600 hover:underline">delete</button>
                  </td>
                </tr>
              )
            })}
            {!all.length && (
              <tr><td colSpan={7} className="py-3 text-neutral-500">No stops yet — add your first one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <SegmentForm
          initial={modal.seg}
          cities={cities.data ?? []}
          defaultArrive={trip.data.state.meta.startDate || ''}
          onCancel={() => setModal(null)}
          onSave={upsert}
        />
      )}
    </main>
  )
}
