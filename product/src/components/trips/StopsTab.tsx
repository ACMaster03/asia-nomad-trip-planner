'use client'
import NewCountryBanner from './NewCountryBanner'
import { useMemo, useState } from 'react'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { segNights, regColor, TIER_LABELS } from '@/lib/trips/format'
import { SegmentForm } from '@/components/trips/SegmentForm'
import { StayForm } from '@/components/trips/StayForm'
import { SaveError } from '@/components/trips/SaveError'
import { ViewerNotice } from '@/components/trips/ViewerNotice'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { useTripRole } from '@/lib/trips/useTripRole'
import type { Segment } from '@/lib/trips/types'

export function StopsTab() {
  const { trip, cities, cityIdx } = useTripScreen()
  const mut = useTripMutation()
  const { canEdit } = useTripRole()
  const [modal, setModal] = useState<{ seg: Segment | null } | null>(null)
  // "＋ stay" shortcut per row — add accommodation without switching tabs
  // (owner request 2026-07-24).
  const [stayFor, setStayFor] = useState<string | null>(null)

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
        <h1 className="text-2xl font-semibold">Stops</h1>
        {canEdit && (
          <button onClick={() => setModal({ seg: null })} className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">
            + Add stop
          </button>
        )}
      </div>
      {trip.data && <NewCountryBanner state={trip.data.state} />}
      <ViewerNotice />
      <p className="mb-4 text-sm text-neutral-500">
        Your stops in date order.
        {canEdit && ' Toggle the checkbox to include a stop in the plan & budget.'}
      </p>

      <SaveError show={mut.isError} error={mut.error} />

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
            {/* Phone-width: Country folds under the stop name, Tier hides —
                the row fits without sideways scrolling (dogfood 2026-07-24). */}
            <tr className="text-left text-neutral-500">
              <th className="py-1 pr-2">In plan</th>
              <th className="pr-4">Stop</th>
              <th className="hidden pr-4 sm:table-cell">Country</th>
              <th className="pr-4">Dates</th>
              <th className="pr-2 sm:pr-4"><span className="sm:hidden">N</span><span className="hidden sm:inline">Nights</span></th>
              <th className="hidden pr-4 sm:table-cell">Tier</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {all.map((s) => {
              const inPlan = s.include !== false
              return (
                <tr key={s.id} className={'border-t border-neutral-200 dark:border-neutral-800 ' + (inPlan ? '' : 'opacity-50')}>
                  <td className="py-1 pr-2">
                    <input
                      type="checkbox"
                      aria-label="Include in plan"
                      checked={inPlan}
                      disabled={!canEdit}
                      onChange={() => toggle(s.id)}
                    />
                  </td>
                  <td className="pr-4 font-medium">
                    {s.city}
                    <span className="block text-xs font-normal text-neutral-500 sm:hidden">{s.country}</span>
                  </td>
                  <td className="hidden pr-4 sm:table-cell">{s.country}</td>
                  <td className="pr-4 whitespace-nowrap" title={`${s.arrive} → ${s.depart}`}>
                    <span className="sm:hidden">{s.arrive.slice(5)} → {s.depart.slice(5)}</span>
                    <span className="hidden sm:inline">{s.arrive} → {s.depart}</span>
                  </td>
                  <td className="pr-2 sm:pr-4">{segNights(s)}</td>
                  <td className="hidden pr-4 sm:table-cell">{TIER_LABELS[s.tier ?? 1] ?? s.tier}</td>
                  <td className="whitespace-nowrap">
                    {canEdit && (
                      <>
                        <button onClick={() => setStayFor(s.id)} className="text-xs text-teal-600 hover:underline" title="Add accommodation for this stop">＋ stay</button>
                        <button onClick={() => setModal({ seg: s })} className="ml-3 text-xs text-teal-600 hover:underline">edit</button>
                        <button onClick={() => del(s.id)} className="ml-3 text-xs text-red-600 hover:underline"><span className="sm:hidden" aria-label="delete">✕</span><span className="hidden sm:inline">delete</span></button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
            {!all.length && (
              <tr><td colSpan={7} className="py-3 text-neutral-500">{canEdit ? 'No stops yet — add your first one.' : 'No stops yet.'}</td></tr>
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
      {stayFor && (
        <StayForm
          initial={null}
          segments={all}
          defaultSegId={stayFor}
          currencies={Object.keys(trip.data.state.rates)}
          onCancel={() => setStayFor(null)}
          onSave={(stay) => {
            mut.mutate((s) => ({ ...s, stays: [...s.stays, stay] }))
            setStayFor(null)
          }}
        />
      )}
    </main>
  )
}
