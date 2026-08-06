'use client'
import NewCountryBanner from './NewCountryBanner'
import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { segNights, nightsBetween, TIER_LABELS } from '@/lib/trips/format'
import { SegmentForm } from '@/components/trips/SegmentForm'
import { StayForm } from '@/components/trips/StayForm'
import { SaveError } from '@/components/trips/SaveError'
import { ViewerNotice } from '@/components/trips/ViewerNotice'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { useTripRole } from '@/lib/trips/useTripRole'
import type { Segment } from '@/lib/trips/types'

// LIVHOLD list-card idioms (handoff itinerary frames): the whole card taps to
// edit, the tick is its own 24×24 target, statuses live on a line below.
const tick = (on: boolean) =>
  'flex h-6 w-6 flex-none items-center justify-center rounded-lg text-base font-semibold transition-colors duration-[180ms] ' +
  (on ? 'border border-ac bg-ac text-on' : 'border-[1.5px] border-ln3 text-transparent')

const fmtD = (d: string) => {
  const t = new Date(d)
  return Number.isNaN(+t) ? (d || '—') : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function StopsTab() {
  const { trip, cities } = useTripScreen()
  const mut = useTripMutation()
  const { canEdit } = useTripRole()
  const [modal, setModal] = useState<{ seg: Segment | null } | null>(null)
  // "＋ stay" shortcut per card — add accommodation without switching tabs
  // (owner request 2026-07-24).
  const [stayFor, setStayFor] = useState<string | null>(null)

  const all = useMemo(() => {
    if (!trip.data) return []
    const t = (d: string) => { const n = +new Date(d); return Number.isNaN(n) ? Infinity : n } // bad/empty dates sort last
    return trip.data.state.segments.slice().sort((a, b) => t(a.arrive) - t(b.arrive))
  }, [trip.data])
  const planned = useMemo(() => all.filter((s) => s.include !== false), [all])

  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />
  const state = trip.data.state

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

  const todayIso = new Date().toISOString().slice(0, 10)
  const stayOf = (segId: string) => state.stays.find((x) => x.segId === segId && x.include)
  const placedNights = planned.reduce((a, s) => a + segNights(s), 0)
  const tripNights = nightsBetween(state.meta.startDate, state.meta.endDate)

  return (
    <main className="mx-auto max-w-xl px-[18px] pb-6 pt-[18px]">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-serif text-[25px] font-semibold">Stops</h1>
        {canEdit && (
          <button onClick={() => setModal({ seg: null })} className="rounded-[calc(var(--r)-3px)] bg-ac px-4 py-2.5 text-base font-semibold text-on">
            + Add stop
          </button>
        )}
      </div>
      <p className="mb-4 mt-1 text-base text-tx2">
        Your stops in date order. Untick one and it leaves the plan and the budget.
        {canEdit && <span className="font-medium text-ac2-deep"> Tap a card to edit or delete it.</span>}
      </p>
      {trip.data && <NewCountryBanner state={state} />}
      <ViewerNotice />
      <SaveError show={mut.isError} error={mut.error} />

      <div className="flex flex-col gap-3">
        {all.map((s) => {
          const inPlan = s.include !== false
          const nn = segNights(s)
          const stay = stayOf(s.id)
          const isCurrent = inPlan && !!s.arrive && !!s.depart && s.arrive <= todayIso && todayIso <= s.depart
          const pct = isCurrent && nn > 0 ? Math.min(100, Math.max(0, Math.round((nightsBetween(s.arrive, todayIso) / nn) * 100))) : 0
          return (
            <div
              key={s.id}
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
              onClick={canEdit ? () => setModal({ seg: s }) : undefined}
              onKeyDown={canEdit ? (e) => { if (e.key === 'Enter') setModal({ seg: s }) } : undefined}
              className={'lv-enter rounded-[var(--r)] bg-sf p-[18px] ' + (canEdit ? 'cursor-pointer ' : '') + (inPlan ? '' : 'opacity-60')}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label="Include in plan"
                  aria-pressed={inPlan}
                  disabled={!canEdit}
                  onClick={(e) => { e.stopPropagation(); toggle(s.id) }}
                  className={tick(inPlan)}
                >
                  ✓
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[18px] font-semibold">{s.city}</span>
                  <span className="block text-base text-tx2">
                    {s.country} · {fmtD(s.arrive)} → {fmtD(s.depart)} · {TIER_LABELS[s.tier ?? 1] ?? s.tier}
                  </span>
                </span>
                <span className="flex-none text-right">
                  <span className="block text-[19px] font-semibold">{nn}</span>
                  <span className="block text-base uppercase tracking-[.08em] text-tx2">nights</span>
                </span>
              </div>
              {isCurrent && nn > 0 && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-track">
                  <span className="block h-full rounded-full bg-ac" style={{ width: pct + '%' }} />
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-3">
                {!inPlan ? (
                  <span className="text-base font-medium text-tx3">Nights not counted</span>
                ) : stay ? (
                  <span className="truncate text-base font-medium text-ac">Stay: {stay.name || 'booked'}</span>
                ) : (
                  <span className="text-base font-medium text-warn">No stay yet</span>
                )}
                {canEdit && (
                  <span className="flex flex-none gap-4">
                    <button
                      type="button"
                      title="Add accommodation for this stop"
                      onClick={(e) => { e.stopPropagation(); setStayFor(s.id) }}
                      className="text-base font-semibold text-ac2"
                    >
                      ＋ Add stay
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); del(s.id) }}
                      className="text-base font-semibold text-ac2"
                    >
                      Delete
                    </button>
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {!all.length && (
          <div className="rounded-[var(--r)] bg-sf p-[18px] text-base text-tx2">
            {canEdit ? 'No stops yet — add your first one.' : 'No stops yet.'}
          </div>
        )}
        {planned.length > 0 && (
          <div className="flex items-center justify-between rounded-[var(--r)] bg-sf p-4">
            <span className="text-base font-medium text-tx2">
              {planned.length} {planned.length === 1 ? 'stop' : 'stops'} ·{' '}
              {tripNights > 0 ? `${placedNights} of ${tripNights} nights placed` : `${placedNights} nights`}
              {state.meta.endDate ? ` · home ${fmtD(state.meta.endDate)}` : ''}
            </span>
            <ChevronRight aria-hidden className="size-5 text-ac2" />
          </div>
        )}
      </div>

      {modal && (
        <SegmentForm
          initial={modal.seg}
          cities={cities.data ?? []}
          defaultArrive={state.meta.startDate || ''}
          onCancel={() => setModal(null)}
          onSave={upsert}
        />
      )}
      {stayFor && (
        <StayForm
          initial={null}
          segments={all}
          defaultSegId={stayFor}
          currencies={Object.keys(state.rates)}
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
