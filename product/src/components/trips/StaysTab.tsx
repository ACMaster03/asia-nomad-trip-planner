'use client'
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { toBase } from '@/lib/trips/format'
import { computeBudget } from '@/lib/trips/budget'
import { StayForm } from './StayForm'
import { SaveError } from './SaveError'
import { ViewerNotice } from './ViewerNotice'
import CreateTripEmptyState from './CreateTripEmptyState'
import { useTripRole } from '@/lib/trips/useTripRole'
import type { Stay } from '@/lib/trips/types'

// 24px visual tick inside a 44px tap target: the negative margin keeps the
// layout where the bare box sat, and the padding doubles as a generous
// stopPropagation zone so a near-miss toggles instead of opening the editor.
const tickBtn = '-m-2.5 flex size-11 flex-none items-center justify-center'
const tick = (on: boolean) =>
  'flex h-6 w-6 items-center justify-center rounded-lg text-base font-semibold transition-colors duration-[180ms] ' +
  (on ? 'border border-ac bg-ac text-on' : 'border-[1.5px] border-ln3 text-transparent')

export function StaysTab() {
  const { fmt } = useMoney()
  const { trip, cities, cityIdx } = useTripScreen()
  const mut = useTripMutation()
  const { canEdit } = useTripRole()
  const [modal, setModal] = useState<{ stay: Stay | null } | null>(null)
  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />
  const s = trip.data.state
  const currencies = Object.keys(s.rates)
  const cityOf = (segId: string) => s.segments.find((x) => x.id === segId)?.city ?? '—'
  const createStop = (seg: (typeof s.segments)[number]) =>
    mut.mutate((st) => ({ ...st, segments: [...st.segments, seg] }))

  const upsert = (it: Stay) => {
    mut.mutate((st) => ({
      ...st,
      stays: st.stays.some((x) => x.id === it.id) ? st.stays.map((x) => (x.id === it.id ? it : x)) : [...st.stays, it],
    }))
    setModal(null)
  }
  const del = (id: string) => { if (confirm('Delete this option?')) mut.mutate((st) => ({ ...st, stays: st.stays.filter((x) => x.id !== id) })) }
  const toggle = (id: string) => mut.mutate((st) => ({ ...st, stays: st.stays.map((x) => (x.id === id ? { ...x, include: !x.include } : x)) }))

  // Accommodation summary — same math the Budget tab trusts: chosen stays are
  // "real", everything else is a catalogue estimate.
  const b = computeBudget(s, cityIdx)
  const realStops = b.perSeg.filter((p) => p.accomSrc === 'included').length

  return (
    <main className="mx-auto max-w-xl px-[18px] pb-6 pt-[18px]">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-serif text-[25px] font-semibold">Stays</h1>
        {canEdit && (
          <button onClick={() => setModal({ stay: null })} className="rounded-[calc(var(--r)-3px)] bg-ac px-4 py-2.5 text-base font-semibold text-on">
            + Add
          </button>
        )}
      </div>
      <p className="mb-4 mt-1 text-base text-tx2">
        Accommodation options per stop. Tick one to count it in the budget instead of the estimate.
        {canEdit && <span className="font-medium text-ac2-deep"> Tap a card to edit or delete it.</span>}
      </p>
      <ViewerNotice />
      <SaveError show={mut.isError} error={mut.error} />

      <div className="flex flex-col gap-3">
        {s.stays.map((x) => {
          const deadlines = [
            x.cancelUntil ? `free-cancel ${x.cancelUntil}` : '',
            x.chargeDate ? `charged ${x.chargeDate}` : '',
          ].filter(Boolean).join(' · ')
          return (
            <div
              key={x.id}
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
              onClick={canEdit ? () => setModal({ stay: x }) : undefined}
              onKeyDown={canEdit ? (e) => { if (e.key === 'Enter') setModal({ stay: x }) } : undefined}
              className={'lv-enter rounded-[var(--r)] bg-sf p-[18px] ' + (canEdit ? 'cursor-pointer ' : '') + (x.include ? '' : 'opacity-60')}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label="Include in budget"
                  aria-pressed={!!x.include}
                  disabled={!canEdit}
                  onClick={(e) => { e.stopPropagation(); toggle(x.id) }}
                  className={tickBtn}
                >
                  <span aria-hidden className={tick(!!x.include)}>✓</span>
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[18px] font-semibold">{x.name}</span>
                  <span className="block text-base text-tx2">
                    {cityOf(x.segId)} · {x.platform} · {x.status}
                  </span>
                </span>
                <span className="flex-none text-right">
                  <span className="block whitespace-nowrap text-[19px] font-semibold">{x.ppn} {x.cur}</span>
                  <span className="block text-base text-tx2">{fmt(toBase(x.ppn, x.cur, s.rates))}</span>
                </span>
              </div>
              {(deadlines || canEdit) && (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className={'truncate text-base font-medium ' + (x.include ? 'text-ac' : 'text-tx2')}>{deadlines}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); del(x.id) }}
                      className="-my-2.5 inline-flex min-h-11 flex-none items-center text-base font-semibold text-ac2"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {!s.stays.length && (
          <div className="rounded-[var(--r)] bg-sf p-[18px] text-base text-tx2">No accommodation options yet.</div>
        )}
        {b.perSeg.length > 0 && (
          <div className="flex items-center justify-between rounded-[var(--r)] bg-sf p-4">
            <span className="text-base font-medium text-tx2">
              {fmt(b.accom)} · {realStops} real, {b.missingAccomStops.length} estimated
            </span>
            <ChevronRight aria-hidden className="size-5 text-ac2" />
          </div>
        )}
      </div>

      {modal && (
        <StayForm
          initial={modal.stay}
          segments={s.segments}
          currencies={currencies}
          cities={cities.data ?? []}
          defaultArrive={s.meta.startDate || ''}
          onCreateStop={createStop}
          onCancel={() => setModal(null)}
          onSave={upsert}
        />
      )}
    </main>
  )
}
