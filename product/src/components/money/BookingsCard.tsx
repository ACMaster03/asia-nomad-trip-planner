'use client'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { BookingRow } from '@/lib/trips/spending'

// Bookings — committed money, in five figures (owner review, 2026-09-19).
//
// It used to list every ticked stay and every planned leg and then close with
// three footer lines: fourteen numbers on a phone to answer "how much of this
// is already committed". The per-booking detail already exists on the Trip
// page, which is also the only place you can edit it — so Money shows the two
// halves, the three states and one total, and taps through. Nothing is lost;
// it moved to where you act on it.
//
// The three states still partition the total exactly, which is the point of
// splitting them: PAID is in the ledger and already counted as spend,
// SCHEDULED & TO PAY is booked and owed, NOT BOOKED is a draft nobody owes
// money on yet.

export function BookingsCard({ stays, transport, paid, toPay, draftedStays, draftStays, fmt, todayIso }: {
  stays: BookingRow[]
  transport: BookingRow[]
  paid: number
  toPay: number
  /** total of the drafted stays — counted in neither paid nor toPay */
  draftedStays: number
  draftStays: number
  fmt: (n: number) => string
  todayIso: string
}) {
  const sum = (rows: BookingRow[]) => rows.reduce((a, r) => a + r.amount, 0)
  // `paid` counts every row that is on the books, charge date or not — split it
  // so the card never calls a December charge "paid" (the Trip page doesn't either).
  const scheduled = [...stays, ...transport]
    .filter((r) => r.status === 'paid' && !!r.date && r.date > todayIso)
    .reduce((a, r) => a + r.amount, 0)
  const settled = paid - scheduled
  const draftTransport = transport.filter((r) => r.status === 'unbooked')
  const notBooked = draftedStays + sum(draftTransport)
  const staysTotal = sum(stays)
  const transportTotal = sum(transport)
  const paidStays = stays.filter((r) => r.status === 'paid').length
  const bookedLegs = transport.filter((r) => r.status !== 'unbooked').length

  if (!stays.length && !transport.length) {
    return (
      <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] py-4 text-tx">
        <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">Bookings</div>
        <p className="mt-1.5 text-base text-tx2">No stays chosen and no transport planned yet.</p>
      </div>
    )
  }

  const line = (name: string, value: number, tone = '') => (
    <div className="mt-1.5 flex items-baseline justify-between gap-3 text-base first:mt-0">
      <span className="text-tx2">{name}</span>
      <b className={tone}>{fmt(value)}</b>
    </div>
  )

  return (
    <Link href="/itinerary" className="lv-enter block rounded-[var(--r)] bg-sf px-[18px] pb-4 pt-1.5 text-tx">
      <div className="flex items-center justify-between border-b border-ln py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">Bookings</span>
        <span className="text-[13px] text-tx3">committed money</span>
      </div>
      <div className="grid grid-cols-2 gap-3 pt-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">Stays</div>
          <div className="mt-0.5 text-[21px] font-semibold">{fmt(staysTotal)}</div>
          <div className="text-[13px] text-tx2">
            {paidStays} paid{draftStays > 0 ? ` · ${draftStays} draft` : ''}
          </div>
        </div>
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">Transport</div>
          <div className="mt-0.5 text-[21px] font-semibold">{fmt(transportTotal)}</div>
          <div className="text-[13px] text-tx2">{bookedLegs} of {transport.length} booked</div>
        </div>
      </div>
      <div className="mt-3 border-t border-ln pt-3">
        {line('Paid', settled)}
        {line('Scheduled & to pay', scheduled + toPay)}
        {line('Not booked yet', notBooked, notBooked > 0 ? 'text-warn' : '')}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-ln pt-3">
        <b className="text-[17px]">Total</b>
        <span className="flex items-center gap-1">
          <b className="text-[17px]">{fmt(staysTotal + transportTotal)}</b>
          <ChevronRight aria-hidden className="size-5 text-ac2" />
        </span>
      </div>
      <p className="mt-1.5 text-[13px] text-tx2">Every stay and leg, and the editing, is on the Trip page.</p>
    </Link>
  )
}
