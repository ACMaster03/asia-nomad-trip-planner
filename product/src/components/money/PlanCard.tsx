'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Info } from 'lucide-react'
import type { StopPlan, BookingRow, Projection } from '@/lib/trips/spending'
import type { TripState } from '@/lib/trips/types'

// Plan — the forecast, led by its one number (mock 16 §5, 2026-09-23).
//
// The card opens with the projected total, then one short line per city
// (Petra, round 1: "so many informations that I don't even want to read
// it"). A tap on a city opens its sum in words, three lines that add up to
// the row's number: what you already spent here, the nights still to come at
// your pace, the whole stay already paid. Round three's per-night comparison
// (owner review, 2026-09-19: Hanoi at 22 900 a night against Kuala Lumpur at
// 19 700 is what matters) closes the opened sum. Transport, one-offs and the
// rest sit behind "How it adds up". The Add-the-next-stop row is the one
// forward nudge on the page and points at Trip.
//
// This card is a FORECAST, so a drafted stay still shapes it — a price
// someone found beats a city average, and for a city outside the catalogue
// it is the only number there is. It is never reported as money owed; the
// Bookings card is where committed money is counted. A stay nobody booked is
// said in amber, "stay not booked", the colour for what still needs doing.

const d = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const row = 'flex w-full items-start justify-between gap-3 border-t border-ln py-2.5 text-left'
const words = 'flex items-baseline justify-between gap-3 py-1 text-[13px] text-tx2'

export function PlanCard({ plan, transport, projection, state, fmt, todayIso, unbooked, paceKnown }: {
  plan: StopPlan[]
  transport: BookingRow[]
  projection: Projection
  state: TripState
  fmt: (n: number) => string
  todayIso: string
  unbooked: number
  /** a pace exists (three days in the stop); before that the rows rest on city averages */
  paceKnown: boolean
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [sum, setSum] = useState(false)
  const [info, setInfo] = useState(false)
  const plannedNights = plan.reduce((a, p) => a + p.nights, 0)
  const stops = plan.reduce((a, p) => a + p.projected, 0)
  const transportTotal = transport.filter((r) => r.status !== 'unbooked').reduce((a, r) => a + r.amount, 0)
  const lastDepart = plan.reduce((m, p) => (p.seg.depart > m ? p.seg.depart : m), '')
  const planShort = !!state.meta.endDate && !!lastDepart && lastDepart < state.meta.endDate
  const stayWord = (p: StopPlan) =>
    p.stayLabel === 'booked' ? <>stay paid</>
      : p.stayLabel === 'unpaid' ? <>stay booked</>
      : p.stayLabel === 'draft' ? <span className="text-warn">stay not booked</span>
      : <span className="text-warn">no stay yet</span>
  const stayLine = (p: StopPlan) =>
    p.stayLabel === 'booked' ? 'The whole stay, already paid'
      : p.stayLabel === 'unpaid' ? 'The whole stay, booked'
      : 'The stay, not booked'

  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] pb-2 pt-4 text-tx">
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">Plan</span>
        {/* What this card IS, behind a tap (#65). Petra, 23 Sep, on the opened sums: "is
            everything I see here already booked?" No: it is a forecast, and the card has to
            be able to say so without a paragraph on its face. */}
        <button type="button" aria-label="What the plan is" aria-expanded={info} onClick={() => setInfo((v) => !v)} className="-m-2 flex size-11 items-center justify-center text-tx3">
          <Info aria-hidden className="size-[18px]" />
        </button>
      </div>
      <div className="mt-0.5 text-[26px] font-semibold leading-[1.15] tracking-[-.02em]">{paceKnown ? '≈ ' : ''}{fmt(projection.projected)}</div>
      <div className="text-[13px] text-tx2">Projected total · {plannedNights} planned nights, {paceKnown ? 'at this pace' : 'city averages'}</div>
      {info && (
        <p className="mt-2 rounded-[var(--rCtl)] bg-inp px-3.5 py-2.5 text-[13px] leading-snug text-tx2">
          A forecast for the whole journey, not a bill. It adds what you have spent, what is booked, and a guess for what is still to come: the nights ahead at your pace, a stay at the price you found or the city&rsquo;s average, the subscriptions until the end. What is booked is in Bookings.
        </p>
      )}
      <div className="mt-2.5">
        {plan.length === 0 && <p className="border-t border-ln py-3 text-base text-tx2">No stops in the plan yet.</p>}
        {plan.map((p) => {
          const live = p.seg.arrive <= todayIso && todayIso <= p.seg.depart
          const shown = open === p.seg.id
          const perNight = p.nights > 0 ? p.projected / p.nights : 0
          return (
            <div key={p.seg.id}>
              <button type="button" aria-expanded={shown} onClick={() => setOpen(shown ? null : p.seg.id)} className={row}>
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold">{p.seg.city}</span>
                  <span className="block text-[14px] text-tx2">
                    {p.nights} nights{live ? ` · ${p.nightsIn} in` : ''} · {stayWord(p)}
                  </span>
                </span>
                <span className={'flex-none text-base font-semibold' + (p.stayLabel === 'draft' ? ' text-warn' : '')}>
                  {p.remaining > 0 ? '≈ ' : ''}{fmt(p.projected)}
                </span>
              </button>
              {shown && (
                <div className="mb-2.5 rounded-[var(--rCtl)] bg-inp px-3.5 py-2">
                  {p.spent > 0 && (
                    <div className={words}><span>Already spent here, {p.nightsIn} {p.nightsIn === 1 ? 'night' : 'nights'}</span><b className="text-tx">{fmt(p.spent)}</b></div>
                  )}
                  {p.remaining > 0 && (
                    <div className={words}>
                      <span>
                        {p.remaining} more {p.remaining === 1 ? 'night' : 'nights'}{' '}
                        {p.rateSrc === 'pace' ? `at your pace, ${fmt(p.rate)} a day` : `at the city average, ${fmt(p.rate)} a night`}
                      </span>
                      <b className="text-tx">{fmt(p.remaining * p.rate)}</b>
                    </div>
                  )}
                  {p.stay > 0 && (
                    <div className={words + (p.stayLabel === 'draft' ? ' text-warn' : '')}><span>{stayLine(p)}</span><b className={p.stayLabel === 'draft' ? '' : 'text-tx'}>{fmt(p.stay)}</b></div>
                  )}
                  {/* The three lines above add up to this; then what that is a night (owner review, 2026-09-19),
                      said as a sentence (Petra, 23 Sep: two bare numbers on one line did not explain themselves). */}
                  <div className={words + ' border-t border-ln'}><span>Together</span><b className="text-tx">{fmt(p.projected)}</b></div>
                  {perNight > 0 && <div className="pb-1 text-[13px] text-tx3">{fmt(perNight)} for each of the {p.nights} nights.</div>}
                </div>
              )}
            </div>
          )
        })}
        {planShort && (
          <Link href="/itinerary" className={row}>
            <span><span className="block text-base font-semibold">Add the next stop</span><span className="block text-[14px] text-tx2">the plan ends {d(lastDepart)}; the journey ends {d(state.meta.endDate!)}</span></span>
            <span className="text-ac2">›</span>
          </Link>
        )}
        <button type="button" aria-expanded={sum} onClick={() => setSum((v) => !v)} className={row}>
          <span>
            <span className="block text-base font-semibold">How it adds up</span>
            <span className="block text-[14px] text-tx2">
              transport, one-offs{unbooked > 0 && <> · <span className="text-warn">{unbooked} {unbooked === 1 ? 'leg' : 'legs'} to book</span></>}
            </span>
          </span>
          <span className="text-ac2">{sum ? '⌃' : '›'}</span>
        </button>
        {sum && (
          <div className="mb-2 rounded-[var(--rCtl)] bg-inp px-3.5 py-2">
            {/* Four things that add up, nothing else (Petra, 23 Sep: "so many things"). The
                stays nobody booked are said on their own city rows, in amber, not repeated
                here: a note about them next to "transport booked" read as a contradiction. */}
            <div className={words}><span>The cities above</span><b className="text-tx">{fmt(stops)}</b></div>
            <div className={words}><span>Transport</span><b className="text-tx">{fmt(transportTotal)}</b></div>
            {projection.residual !== 0 && (
              <div className={words}><span>Everything else you logged</span><b className="text-tx">{fmt(projection.residual)}</b></div>
            )}
            {projection.subsAhead > 0 && (
              <div className={words}><span>Subscriptions still to come</span><b className="text-tx">{fmt(projection.subsAhead)}</b></div>
            )}
            <div className={words + ' border-t border-ln font-semibold text-ac2-deep'}><span>Together, the projected total</span><b>{fmt(projection.projected)}</b></div>
          </div>
        )}
      </div>
    </div>
  )
}
