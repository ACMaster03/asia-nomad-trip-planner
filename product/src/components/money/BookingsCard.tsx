'use client'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { bookingsSummary } from '@/lib/trips/spending'
import { shortMoney } from '@/lib/trips/moneyText'
import { CardLabel } from './CardLabel'
import { CategoryTile } from './CategoryTile'

// Bookings (the phone's BookingsCard): two rows and what's paid, always open
// (Patrik, 29 Sep: it's only two rows); the total beside the title, as Plan's.
// Stays and transport are booked and changed on Trip, so each row goes there.
// The four states (spending.ts bookingsSummary): paid once the charge date has
// passed, scheduled while the charge is still ahead, unpaid when booked with
// no entry yet, unbooked for an idea that counts in no figure.

export function BookingsCard({ bookings, fmt }: { bookings: ReturnType<typeof bookingsSummary>; fmt: (n: number) => string }) {
  const b = bookings
  const all = [...b.stays, ...b.transport]
  const sum = (rows: typeof all) => rows.reduce((a, r) => a + r.amount, 0)
  const notBooked = sum(all.filter((r) => r.status === 'unbooked'))
  const due = b.scheduled + b.toPay
  const paid = b.stays.filter((r) => r.status === 'paid').length
  const booked = b.stays.filter((r) => r.status === 'scheduled' || r.status === 'unpaid').length
  const unbooked = b.stays.filter((r) => r.status === 'unbooked').length
  const staysDetail = [
    paid > 0 || booked === 0 ? `${paid} paid` : null,
    booked > 0 ? `${booked} booked` : null,
    unbooked > 0 ? `${unbooked} not booked` : null,
  ].filter(Boolean).join(' · ')
  const row = (cat: string, title: string, detail: string, amount: number, offPlan = 0) => (
    <Link href="/itinerary" className="flex items-center gap-3 py-2">
      <CategoryTile id={cat} size={30} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block text-[12.5px] text-tx2">
          {detail}
          {/* A booked stay at a stop no longer in the plan still counts (#105). */}
          {offPlan > 0 && <span className="text-warn"> · {offPlan} not in the plan</span>}
        </span>
      </span>
      <span className="text-[15px] font-semibold tabular-nums">{shortMoney(amount, fmt)}</span>
      <ChevronRight aria-hidden className="size-[13px] text-tx3" strokeWidth={2.6} />
    </Link>
  )
  const sumLine = (title: string, v: number, warn = false) => (
    <div className={'flex justify-between text-[13.5px] ' + (warn ? 'text-warn' : 'text-tx2')}>
      <span>{title}</span><span className="tabular-nums">{fmt(v)}</span>
    </div>
  )
  return (
    <div className="lv-enter lv-settle rounded-[var(--r)] bg-sf px-4 py-3 text-tx">
      <div className="flex items-baseline justify-between gap-3 pb-1">
        <CardLabel mauve>Bookings</CardLabel>
        {all.length > 0 && <span className="text-[13px] font-medium text-tx2">{shortMoney(b.total, fmt)}</span>}
      </div>
      {all.length === 0 ? (
        <Link href="/itinerary" className="block py-2.5 text-[14px] text-tx2">No stays or transport in the plan yet. They’re added on Trip <span className="text-ac">›</span></Link>
      ) : (
        <div className="divide-y divide-ln">
          {b.stays.length > 0 && row('stays', 'Stays', staysDetail, sum(b.stays), b.offPlanStays)}
          {b.transport.length > 0 && row('transport', 'Transport', `${b.transport.filter((r) => r.status !== 'unbooked').length} of ${b.transport.length} booked`, sum(b.transport))}
          <div className="flex flex-col gap-1 pt-2.5">
            {b.paid > 0 && sumLine('Paid', b.paid)}
            {due > 0 && sumLine('Scheduled & to pay', due)}
            {notBooked > 0 && sumLine('Not booked yet', notBooked, true)}
          </div>
        </div>
      )}
    </div>
  )
}
