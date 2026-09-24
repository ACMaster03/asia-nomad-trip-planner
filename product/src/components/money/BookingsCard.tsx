'use client'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { BookingRow } from '@/lib/trips/spending'
import { FoldButton, FoldedRow } from './Fold'

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
//
// On the full Money page it starts folded to one line (Fold.tsx): the total,
// and what is not booked yet in amber, or else what is still to pay. The quiet
// page shows it open, without ⌃: there it is the whole page.

export function BookingsCard({ stays, transport, paid, toPay, draftedStays, draftStays, fmt, todayIso, folded, onToggle }: {
  stays: BookingRow[]
  transport: BookingRow[]
  paid: number
  toPay: number
  /** total of the drafted stays — counted in neither paid nor toPay */
  draftedStays: number
  draftStays: number
  fmt: (n: number) => string
  todayIso: string
  /** with onToggle: one line, or the card with ⌃ (Fold.tsx) */
  folded?: boolean
  onToggle?: () => void
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

  const total = staysTotal + transportTotal
  const due = scheduled + toPay
  if (folded && onToggle) {
    return (
      <FoldedRow
        title="Bookings"
        onOpen={onToggle}
        summary={notBooked > 0
          ? <>{fmt(total)} · <span className="whitespace-nowrap text-warn">{fmt(notBooked)} not booked yet</span></>
          : due > 0 ? <>{fmt(total)} · {fmt(due)} to pay</> : <>{fmt(total)}, all paid</>}
      />
    )
  }

  const line = (name: string, value: number, tone = '') => (
    <div className="mt-1.5 flex items-baseline justify-between gap-3 text-base first:mt-0">
      <span className="text-tx2">{name}</span>
      <b className={tone}>{fmt(value)}</b>
    </div>
  )

  const header = (
    <div className="flex items-center justify-between border-b border-ln py-2.5">
      <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">Bookings</span>
      <span className="flex items-center gap-1">
        <span className="text-[13px] text-tx3">committed money</span>
        {onToggle && <FoldButton label="Bookings" onFold={onToggle} />}
      </span>
    </div>
  )
  const body = (
    <>
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
          <b className="text-[17px]">{fmt(total)}</b>
          <ChevronRight aria-hidden className="size-5 text-ac2" />
        </span>
      </div>
    </>
  )
  // Foldable, the header holds ⌃, so only the figures tap through to the Trip
  // page: a button cannot sit inside a link.
  if (onToggle) {
    return (
      <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] pb-4 pt-1.5 text-tx">
        {header}
        <Link href="/itinerary" className="block">{body}</Link>
      </div>
    )
  }
  return (
    <Link href="/itinerary" className="lv-enter block rounded-[var(--r)] bg-sf px-[18px] pb-4 pt-1.5 text-tx">
      {header}
      {body}
    </Link>
  )
}
