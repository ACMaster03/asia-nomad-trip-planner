'use client'
import Link from 'next/link'
import { nightsBetween } from '@/lib/trips/format'
import { inDays } from '@/lib/trips/moneyText'
import { shortDate } from '@/lib/trips/timeline'
import type { Upcoming } from '@/lib/trips/moneyRows'
import { CardLabel } from './CardLabel'
import { CategoryTile } from './CategoryTile'

// Upcoming charges (the phone's UpcomingCard, #149): every charge dated ahead
// but the subscriptions, the three soonest, the total in the corner. Each row
// opens its booking's form, or the entry's.

export function UpcomingCard({ rows, fmt, todayIso, canEdit, onOpen }: {
  rows: Upcoming[]
  fmt: (n: number) => string
  todayIso: string
  canEdit: boolean
  onOpen: (u: Upcoming) => void
}) {
  const total = rows.reduce((a, u) => a + u.amount, 0)
  // "15 Sep · in 16 days", "13 Nov, at check-in · Da Nang".
  const detail = (u: Upcoming) => {
    const day = u.atCheckIn ? `${shortDate(u.date)}, at check-in` : shortDate(u.date)
    return u.city ? `${day} · ${u.city}` : `${day} · ${inDays(nightsBetween(todayIso, u.date))}`
  }
  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf px-4 py-3 text-tx">
      <div className="flex items-baseline justify-between gap-3 pb-1">
        <CardLabel mauve>Upcoming charges</CardLabel>
        <span className="text-[13px] font-medium text-tx2">{fmt(total)}</span>
      </div>
      <div className="divide-y divide-ln">
        {rows.slice(0, 3).map((u) => (
          <button key={u.id} type="button" disabled={!canEdit} onClick={() => onOpen(u)} className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left">
            <CategoryTile id={u.category} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{u.title}</span>
              <span className="block truncate text-[12.5px] text-tx2">{detail(u)}</span>
            </span>
            <span className="flex-none text-[15px] font-semibold tabular-nums">{fmt(u.amount)}</span>
          </button>
        ))}
        {rows.length > 3 && (
          <Link href="/money/entries?coming=1" className="block py-2.5 text-[13.5px] font-medium text-ac">{rows.length - 3} more in All entries ›</Link>
        )}
      </div>
    </div>
  )
}
