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
// only number there is. It is marked ≈ and never reported as money owed; the
// Bookings card above is where committed money is counted.

const d = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const band = 'mt-1.5 -mx-[18px] flex items-center justify-between gap-3 bg-ac2-soft px-[18px] py-3 text-base font-semibold text-ac2-deep'

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
  const transportTotal = transport.filter((r) => r.status !== 'unbooked').reduce((a, r) => a + r.amount, 0)
  const booked = transport.length - unbooked
  const lastDepart = plan.reduce((m, p) => (p.seg.depart > m ? p.seg.depart : m), '')
  const planShort = !!state.meta.endDate && !!lastDepart && lastDepart < state.meta.endDate
  const stayText = (p: StopPlan) =>
    p.stayLabel === 'booked' ? 'stay booked'
      : p.stayLabel === 'unpaid' ? 'stay chosen, unpaid'
      : p.stayLabel === 'draft' ? 'stay drafted · forecast only'
      : p.stayLabel === 'estimate' ? 'no stay yet · city average'
      : 'no stay yet'
  const breakdown = (p: StopPlan) => {
    const parts: string[] = []
    if (p.spent > 0) parts.push(`${fmt(p.spent)} spent`)
    if (p.remaining > 0) parts.push(`${p.remaining} nights × ${fmt(p.rate)}${p.rateSrc === 'catalogue' ? ' (city average)' : ' at your pace'}`)
    if (p.stay > 0) parts.push(`stay ${p.stayLabel === 'draft' ? '≈ ' : ''}${fmt(p.stay)}`)
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
        return (
          <div key={p.seg.id}>
            <div className="flex items-start justify-between gap-3 border-t border-ln pt-2.5 pb-1">
              <span className="min-w-0">
                <span className="block text-base font-semibold">{p.seg.city}</span>
                <span className="block text-[14px] text-tx2">
                  {p.nights} nights{live ? ` · ${p.nightsIn} in` : p.nightsIn >= p.nights && p.nights > 0 ? ' · done' : ` · from ${d(p.seg.arrive)}`} · {stayText(p)}
                </span>
              </span>
              <span className="flex-none text-base font-semibold">{(p.remaining > 0 && p.rateSrc === 'catalogue') || p.stayLabel === 'draft' ? '≈ ' : ''}{fmt(p.projected)}</span>
            </div>
            <div className="pb-2.5 text-[13px] text-tx2">{breakdown(p) || 'nothing counted yet'}</div>
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
