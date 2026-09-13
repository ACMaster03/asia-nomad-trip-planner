'use client'
import Link from 'next/link'
import type { BookingRow } from '@/lib/trips/spending'

// Bookings — every chosen stay and planned transport leg with whether the
// money is on the books. Editing stays on the Trip page; this is the money view.

const d = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function status(r: BookingRow, todayIso: string) {
  if (r.kind === 'stay') {
    if (r.status === 'paid') return <span className="text-ac">paid{r.date ? ` ${d(r.date)}` : ''}</span>
    if (!r.date) return <span className="text-warn">charge date not set</span>
    return r.date <= todayIso ? <span className="text-warn">charged {d(r.date)} · not on the books yet</span> : <span>charges {d(r.date)}</span>
  }
  if (r.status === 'paid') return <span className="text-ac">paid</span>
  if (r.status === 'unpaid') return <span>booked · to pay</span>
  return <span className="text-warn">not booked yet</span>
}

export function BookingsCard({ stays, transport, paid, toPay, fmt, todayIso }: {
  stays: BookingRow[]
  transport: BookingRow[]
  paid: number
  toPay: number
  fmt: (n: number) => string
  todayIso: string
}) {
  const row = (r: BookingRow) => (
    <div key={r.kind + r.id} className="flex items-start justify-between gap-3 border-t border-ln py-2.5">
      <span className="min-w-0">
        <span className="block text-base font-semibold">{r.title}</span>
        <span className="block text-[14px] text-tx2">
          {r.kind === 'transport' && r.date ? `${d(r.date)} · ` : ''}{r.detail ? `${r.detail} · ` : ''}{status(r, todayIso)}
        </span>
      </span>
      <span className={'flex-none text-right ' + (r.status === 'unbooked' ? 'text-tx3' : '')}>
        <span className="block text-base font-semibold">{r.amount > 0 ? fmt(r.amount) : '—'}</span>
        {r.original && r.amount > 0 && <span className="block text-[13px] text-tx2">{r.original.amount.toLocaleString('en-US')} {r.original.cur}</span>}
      </span>
    </div>
  )
  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] pb-2 pt-1.5 text-tx">
      <div className="flex items-center justify-between border-b border-ln py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">Bookings</span>
        <Link href="/itinerary" className="text-[13px] text-tx3">edit on the Trip page ›</Link>
      </div>
      {stays.length === 0 && transport.length === 0 && <p className="py-3 text-base text-tx2">No stays chosen and no transport planned yet.</p>}
      {stays.length > 0 && <div className="pb-0.5 pt-3 text-[12px] font-semibold uppercase tracking-[.09em] text-tx3">Stays</div>}
      {stays.map(row)}
      {transport.length > 0 && <div className="pb-0.5 pt-3 text-[12px] font-semibold uppercase tracking-[.09em] text-tx3">Transport</div>}
      {transport.map(row)}
      {(stays.length > 0 || transport.length > 0) && (
        <div className="-mx-[18px] -mb-2 mt-2 flex items-center justify-between gap-3 rounded-b-[var(--r)] rounded-t-[12px] bg-ac2-soft px-[18px] py-3 text-base font-semibold text-ac2-deep">
          <span>Bookings · {fmt(paid)} paid{toPay > 0 ? `, ≈ ${fmt(toPay)} to pay` : ''}</span>
          <span className="flex-none">{fmt(paid + toPay)}</span>
        </div>
      )}
    </div>
  )
}
