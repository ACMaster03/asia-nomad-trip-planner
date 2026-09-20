'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { StopPlan, BookingRow, Projection } from '@/lib/trips/spending'
import type { TripState } from '@/lib/trips/types'

// Plan · by stop — honest about time. A stop you're in: what you've spent
// there plus the nights left at your pace. A future stop: its stay plus nights
// × your pace (city average until you have a pace). The mauve bands are the
// only numbers that matter at a glance.
//
// Round three (owner review, 2026-09-19): the row now carries a PER-NIGHT
// average and the arithmetic moved behind a tap. Hanoi at 22 900/night against
// Kuala Lumpur at 19 700 is the comparison that matters — the totals are not
// comparable at all, because the nights differ. Three lines of arithmetic under
// every row said the same thing the Bookings card and the ledger already said.
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
  const [open, setOpen] = useState<string | null>(null)
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

  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] pb-2 pt-1.5 text-tx">
      <div className="flex items-center justify-between border-b border-ln py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">Plan · by stop</span>
        <span className="text-[13px] text-tx3">tap a row for the maths</span>
      </div>
      {plan.length === 0 && <p className="py-3 text-base text-tx2">No stops in the plan yet.</p>}
      {plan.map((p) => {
        const live = p.seg.arrive <= todayIso && todayIso <= p.seg.depart
        const draft = p.stayLabel === 'draft'
        const perNight = p.nights > 0 ? p.projected / p.nights : 0
        const shown = open === p.seg.id
        return (
          <div key={p.seg.id} className={draft ? draftRow : ''}>
            <div
              role="button"
              tabIndex={0}
              aria-expanded={shown}
              onClick={() => setOpen(shown ? null : p.seg.id)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpen(shown ? null : p.seg.id) } }}
              className={'flex cursor-pointer items-start justify-between gap-3 py-2.5' + (draft ? '' : ' border-t border-ln')}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-base font-semibold">
                  <span className="truncate">{p.seg.city}</span>
                  {draft && <span className={draftChip}>draft</span>}
                </span>
                <span className={'block text-[14px] ' + (draft ? 'text-warn' : 'text-tx2')}>
                  {p.nights} nights{perNight > 0 ? ` · ${fmt(perNight)}/night` : ''}
                  {live ? ` · ${p.nightsIn} in` : p.nightsIn >= p.nights && p.nights > 0 ? ' · done' : ` · from ${d(p.seg.arrive)}`}
                </span>
              </span>
              <span className={'flex-none text-base font-semibold' + (draft ? ' text-warn' : '')}>
                {p.remaining > 0 && p.rateSrc === 'catalogue' ? '≈ ' : ''}{fmt(p.projected)}
              </span>
            </div>
            {shown && (
              <div className={'mb-2.5 rounded-[var(--rCtl)] px-3.5 py-3 text-[13px] leading-[1.7] ' + (draft ? 'bg-sf' : 'bg-inp') + (draft ? ' text-warn' : ' text-tx2')}>
                <div>{stayText(p)}</div>
                {p.stay > 0 && (
                  <div>Stay <b className="text-tx">{fmt(p.stay)}</b>{draft ? ' (not booked)' : ''}</div>
                )}
                {p.spent > 0 && <div>+ logged here <b className="text-tx">{fmt(p.spent)}</b></div>}
                {p.remaining > 0 && (
                  <div>
                    + {p.remaining} {p.remaining === 1 ? 'night' : 'nights'} left × {fmt(p.rate)}
                    {p.rateSrc === 'catalogue' ? ' (city average)' : ' at your pace'} <b className="text-tx">{fmt(p.remaining * p.rate)}</b>
                  </div>
                )}
                <div className="mt-1 border-t border-ln pt-1">
                  = <b className="text-tx">{fmt(p.projected)}</b> over {p.nights} nights ·{' '}
                  <b className="text-tx">{fmt(perNight)}</b>/night
                </div>
              </div>
            )}
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
      {projection.residual !== 0 && (
        <div className="flex items-start justify-between gap-3 border-t border-ln pt-2.5 pb-2.5">
          <span>
            <span className="block text-base font-semibold">Everything else logged</span>
            {/* #35's correction: this is projection.residual — spend MINUS what the
                stops and paid bookings account for. Naming three categories made
                it read as a category total, which it has never been. */}
            <span className="block text-[14px] text-tx2">gear, insurance, fees and days between stops · a remainder, not a category total</span>
          </span>
          <span className="flex-none text-base font-semibold">{fmt(projection.residual)}</span>
        </div>
      )}
      {projection.subsAhead > 0 && (
        <div className="flex items-start justify-between gap-3 border-t border-ln pt-2.5 pb-2.5">
          <span>
            <span className="block text-base font-semibold">Subscriptions ahead</span>
            <span className="block text-[14px] text-tx2">the recurring ones from home, to the end of the trip</span>
          </span>
          <span className="flex-none text-base font-semibold">{fmt(projection.subsAhead)}</span>
        </div>
      )}
      <div className={band + ' -mb-2 rounded-t-[12px] rounded-b-[var(--r)]'}><span>Projected total</span><span>{fmt(projection.projected)}</span></div>
    </div>
  )
}
