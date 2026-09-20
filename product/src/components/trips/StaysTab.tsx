'use client'
import { useState } from 'react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useConfirm } from '@/components/Confirm'
import { toBase, stayNights, stayTotal } from '@/lib/trips/format'
import { computeBudget } from '@/lib/trips/budget'
import { StayForm } from './StayForm'
import { SaveError } from './SaveError'
import { ViewerNotice } from './ViewerNotice'
import CreateTripEmptyState from './CreateTripEmptyState'
import { useTripRole } from '@/lib/trips/useTripRole'
import type { Stay, Segment } from '@/lib/trips/types'

// Stays (round-two design, 2026-09-13): grouped by stop with the stop's dates
// in the header, so the night count in "Total · 29 nights" has an obvious
// source. A ticked stay gets the full card — total and per-night side by side;
// options fade to one line with the rate and what they would total. Charged
// stays land in the ledger on their own; the only thing flagged here is the
// case that still needs the traveller: a chosen stay with no charge date.

const tickBtn = '-m-2.5 flex size-11 flex-none items-center justify-center'
const tick = (on: boolean) =>
  'flex h-6 w-6 items-center justify-center rounded-lg text-base font-semibold transition-colors duration-[180ms] ' +
  (on ? 'border border-ac bg-ac text-on' : 'border-[1.5px] border-ln3 text-transparent')
const d = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function StaysTab() {
  const { fmt } = useMoney()
  const { trip, cities, cityIdx } = useTripScreen()
  const mut = useTripMutation()
  const confirm = useConfirm()
  const { canEdit } = useTripRole()
  const [modal, setModal] = useState<{ stay: Stay | null } | null>(null)
  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />
  const s = trip.data.state
  const currencies = Object.keys(s.rates)
  const createStop = (seg: Segment) => mut.mutate((st) => ({ ...st, segments: [...st.segments, seg] }))

  const upsert = (it: Stay) => {
    mut.mutate((st) => ({
      ...st,
      stays: st.stays.some((x) => x.id === it.id) ? st.stays.map((x) => (x.id === it.id ? it : x)) : [...st.stays, it],
    }))
    setModal(null)
  }
  const del = async (id: string) => {
    if (!(await confirm({ title: 'Delete this stay?' }))) return
    mut.mutate((st) => ({ ...st, stays: st.stays.filter((x) => x.id !== id) }))
    setModal(null)
  }
  const toggle = (id: string) => mut.mutate((st) => ({ ...st, stays: st.stays.map((x) => (x.id === id ? { ...x, include: !x.include } : x)) }))

  const b = computeBudget(s, cityIdx)
  const realStops = b.perSeg.filter((p) => p.accomSrc === 'included').length
  const segs = s.segments.slice().sort((a, c) => a.arrive.localeCompare(c.arrive))
  const groups: { seg: Segment | null; stays: Stay[] }[] = [
    ...segs.map((seg) => ({ seg, stays: s.stays.filter((x) => x.segId === seg.id) })).filter((g) => g.stays.length),
    { seg: null, stays: s.stays.filter((x) => !segs.some((seg) => seg.id === x.segId)) },
  ].filter((g) => g.stays.length)
  const open = (x: Stay) => canEdit && setModal({ stay: x })

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
        One ticked stay per stop counts in the plan instead of the city average.{canEdit && ' Tap a card to edit.'}
      </p>
      <ViewerNotice />
      <SaveError show={mut.isError} error={mut.error} />

      <div className="flex flex-col gap-3">
        {groups.map(({ seg, stays }) => (
          <div key={seg?.id ?? 'none'} className="flex flex-col gap-2.5">
            <div className="mt-1 text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">
              {seg ? `${seg.city} · ${d(seg.arrive)} – ${d(seg.depart)}` : 'Not attached to a stop'}
            </div>
            {stays.slice().sort((a, c) => Number(!!c.include) - Number(!!a.include)).map((x) => {
              const nights = stayNights(x, seg ?? undefined)
              const total = stayTotal(x, seg ?? undefined)
              const chosen = !!x.include
              const cardProps = {
                role: canEdit ? ('button' as const) : undefined,
                tabIndex: canEdit ? 0 : undefined,
                onClick: () => open(x),
                onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') open(x) },
              }
              if (!chosen) {
                return (
                  <div key={x.id} {...cardProps} className={'lv-enter flex items-center gap-3 rounded-[var(--r)] bg-sf px-[18px] py-3.5 opacity-55 ' + (canEdit ? 'cursor-pointer' : '')}>
                    <button type="button" aria-label="Count this stay in the plan" aria-pressed={false} disabled={!canEdit} onClick={(e) => { e.stopPropagation(); toggle(x.id) }} className={tickBtn}>
                      <span aria-hidden className={tick(false)}>✓</span>
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold">{x.name}</span>
                      <span className="block text-[13px] text-tx2">
                        {[x.platform, x.status || 'option'].filter(Boolean).join(' · ')} · {x.ppn} {x.cur} / night{nights ? ` · ≈ ${fmt(toBase(total, x.cur, s.rates))} for ${nights}` : ''}
                      </span>
                    </span>
                  </div>
                )
              }
              return (
                <div key={x.id} {...cardProps} className={'lv-enter rounded-[var(--r)] bg-sf p-[18px] ' + (canEdit ? 'cursor-pointer' : '')}>
                  <div className="flex items-start gap-3">
                    <button type="button" aria-label="Counted in the plan" aria-pressed disabled={!canEdit} onClick={(e) => { e.stopPropagation(); toggle(x.id) }} className={tickBtn}>
                      <span aria-hidden className={tick(true)}>✓</span>
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[18px] font-semibold">{x.name}</span>
                      <span className="block text-[14px] text-tx2">
                        {[x.platform, x.status].filter(Boolean).join(' · ')}
                        {x.chargeDate ? ` · charged ${d(x.chargeDate)}` : <> · <span className="text-warn">charge date not set</span></>}
                        {x.cancelUntil && ` · free-cancel until ${d(x.cancelUntil)}`}
                      </span>
                    </span>
                  </div>
                  <div className="mt-3.5 grid grid-cols-2 gap-3 border-t border-ln pt-3">
                    <div>
                      <div className="text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">Total · {nights} {nights === 1 ? 'night' : 'nights'}</div>
                      <div className="mt-0.5 text-[22px] font-semibold tracking-[-.01em]">{fmt(toBase(total, x.cur, s.rates))}</div>
                      {x.cur !== (s.meta.baseCurrency || 'HUF') && <div className="text-[14px] text-tx2">{total.toLocaleString('en-US', { maximumFractionDigits: 2 })} {x.cur}</div>}
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">Per night</div>
                      <div className="mt-0.5 text-[22px] font-semibold tracking-[-.01em]">{fmt(toBase(x.ppn, x.cur, s.rates))}</div>
                      {x.cur !== (s.meta.baseCurrency || 'HUF') && <div className="text-[14px] text-tx2">{x.ppn} {x.cur}</div>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        {!s.stays.length && <div className="rounded-[var(--r)] bg-sf p-[18px] text-base text-tx2">No accommodation options yet.</div>}
        {b.perSeg.length > 0 && (
          <div className="mt-1 flex items-center justify-between rounded-[var(--r)] bg-sf p-4">
            <span className="text-base font-medium text-tx2">
              {fmt(b.accom)} · {realStops} {realStops === 1 ? 'stop' : 'stops'} booked, {b.missingAccomStops.length} estimated
            </span>
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
          onDelete={del}
        />
      )}
    </main>
  )
}
