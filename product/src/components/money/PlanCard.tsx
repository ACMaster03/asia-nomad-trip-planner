'use client'
import Link from 'next/link'
import type { StopPlan, BookingRow, Projection } from '@/lib/trips/spending'
import type { TripState } from '@/lib/trips/types'

// Plan · by stop — honest about time. A stop you're in: what you've spent
// there plus the nights left at your pace. A future stop: its stay plus nights
// × your pace (city average until you have a pace). The mauve bands are the
// only numbers that matter at a glance; the breakdown line under each row
// says where the figure comes from.
//
// This card is a FORECAST, so a drafted stay still shapes it — a price someone
// found beats a city average, and for a city outside the catalogue it is the
// only number there is. It is never reported as money owed; the Bookings card
// above is where committed money is counted.
//
// A drafted stop is marked STRUCTURALLY, not with a symbol (owner review
// 2026-09-15): "≈" already means rounded in one place and estimated in
// another, so it cannot also mean "this booking does not exist". The row gets
// the warn tint, a dashed rule top and bottom, a DRAFT chip and an amber
// figure, and the stops subtotal says how much of itself is not booked.

const d = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const band = 'mt-1.5 -mx-[18px] flex items-center justify-between gap-3 bg-ac2-soft px-[18px] py-3 text-base font-semibold text-ac2-deep'
const draftRow = '-mx-[18px] my-1.5 border-y-[1.5px] border-dashed border-warn-line bg-warn-soft px-[18px]'
const draftChip = 'flex-none rounded-full border-[1.4px] border-warn-line px-2 py-[1px] text-[11px] font-bold uppercase tracking-[.08em] text-warn'

export function PlanCard({ plan, transport, projection, state, fmt, todayIso, unbooked }: {
  plan: StopPlan[]
  transport: BookingRow[]
  projection: Projection
  state: TripState
  fmt: (n: number) => string
  todayIso: string
  unbooked: number
}) {
  const stops = plan.reduce((a, p) => a + p.projected, 0)
  // How much of the subtotal rests on stays nobody has booked — the question
  // the chip makes you ask, answered where the number is.
  const draftTotal = plan.filter((p) => p.stayLabel === 'draft').reduce((a, p) => a + p.stay, 0)
  const transportTotal = transport.filter((r) => r.status !== 'unbooked').reduce((a, r) => a + r.amount, 0)
  const booked = transport.length - unbooked
  const lastDepart = plan.reduce((m, p) => (p.seg.depart > m ? p.seg.depart : m), '')
  const planShort = !!state.meta.endDate && !!lastDepart && lastDepart < state.meta.endDate
  const stayText = (p: StopPlan) =>
    p.stayLabel === 'booked' ? 'stay booked'
      : p.stayLabel === 'unpaid' ? 'stay chosen, unpaid'
      : p.stayLabel === 'draft' ? 'stay not booked · forecast only'
      : p.stayLabel === 'estimate' ? 'no stay yet · city average'
      : 'no stay yet'
  const breakdown = (p: StopPlan) => {
    const parts: string[] = []
    if (p.spent > 0) parts.push(`${fmt(p.spent)} spent`)
    if (p.remaining > 0) parts.push(`${p.remaining} nights × ${fmt(p.rate)}${p.rateSrc === 'catalogue' ? ' (city average)' : ' at your pace'}`)
    if (p.stay > 0) parts.push(`stay ${fmt(p.stay)}${p.stayLabel === 'draft' ? ' (not booked)' : ''}`)
    return parts.join(' + ')
  }

  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] pb-2 pt-1.5 text-tx">
      <div className="flex items-center justify-between border-b border-ln py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">Plan · by stop</span>
        <span className="text-[13px] text-tx3">stays + everyday</span>
      </div>
      {plan.length === 0 && <p className="py-3 text-base text-tx2">No stops in the plan yet.</p>}
      {plan.map((p) => {
        const live = p.seg.arrive <= todayIso && todayIso <= p.seg.depart
        const draft = p.stayLabel === 'draft'
        return (
          <div key={p.seg.id} className={draft ? draftRow : ''}>
            <div className={'flex items-start justify-between gap-3 pt-2.5 pb-1' + (draft ? '' : ' border-t border-ln')}>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-base font-semibold">
                  <span className="truncate">{p.seg.city}</span>
                  {draft && <span className={draftChip}>draft</span>}
                </span>
                <span className={'block text-[14px] ' + (draft ? 'text-warn' : 'text-tx2')}>
                  {p.nights} nights{live ? ` · ${p.nightsIn} in` : p.nightsIn >= p.nights && p.nights > 0 ? ' · done' : ` · from ${d(p.seg.arrive)}`} · {stayText(p)}
                </span>
              </span>
              <span className={'flex-none text-base font-semibold' + (draft ? ' text-warn' : '')}>
                {p.remaining > 0 && p.rateSrc === 'catalogue' ? '≈ ' : ''}{fmt(p.projected)}
              </span>
            </div>
            <div className={'pb-2.5 text-[13px] ' + (draft ? 'text-warn' : 'text-tx2')}>{breakdown(p) || 'nothing counted yet'}</div>
          </div>
        )
      })}
      {planShort && (
        <Link href="/itinerary" className="flex items-center justify-between gap-3 border-t border-ln py-2.5">
          <span><span className="block text-base font-semibold">Add the next stop</span><span className="block text-[14px] text-tx2">the plan ends {d(lastDepart)}; the trip ends {d(state.meta.endDate!)}</span></span>
          <span className="text-ac2">›</span>
        </Link>
      )}
      <div className={band + ' rounded-[12px]'}><span>Stops subtotal</span><span>{fmt(stops)}</span></div>
      {draftTotal > 0 && (
        <p className="pt-2 text-[13px] text-warn">
          Includes <b>{fmt(draftTotal)}</b> for {plan.filter((x) => x.stayLabel === 'draft').length === 1 ? 'a stay that is' : 'stays that are'} not booked.
        </p>
      )}
      <div className="flex items-start justify-between gap-3 pt-3 pb-2.5">
        <span><span className="block text-base font-semibold">Transport</span><span className="block text-[14px] text-tx2">{booked} booked{unbooked ? ` · ${unbooked} still to book` : ''}</span></span>
        <span className="flex-none text-base font-semibold">{fmt(transportTotal)}</span>
      </div>
      <div className="flex items-start justify-between gap-3 border-t border-ln pt-2.5 pb-2.5">
        <span><span className="block text-base font-semibold">Gear, e-SIM, insurance</span><span className="block text-[14px] text-tx2">and days outside a stop · already counted above</span></span>
        <span className="flex-none text-base font-semibold">{fmt(projection.residual)}</span>
      </div>
      <div className={band + ' -mb-2 rounded-t-[12px] rounded-b-[var(--r)]'}><span>Projected total</span><span>{fmt(projection.projected)}</span></div>
    </div>
  )
}
