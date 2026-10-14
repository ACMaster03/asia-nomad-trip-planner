'use client'
import { Bus, Plane, Ship, TrainFront } from 'lucide-react'
import { isBookedStatus } from '@/lib/trips/commitment'
import { toBase } from '@/lib/trips/format'
import { legMoneyState, type Leg, type Tone } from '@/lib/trips/timeline'
import type { TransportLeg } from '@/lib/trips/types'
import { fmtDay, fmtHours } from './sheetKit'

// One entry of transport on a leg, or the empty leg (the phone's LegStrip and
// EmptyLegStrip): on the timeline and on the stop page alike (round 3c).

export const TONE: Record<Tone, string> = { ok: 'text-ac', warn: 'text-warn', muted: 'text-tx3' }
const dashed = 'rounded-[calc(var(--r)-6px)] border-[1.5px] border-dashed'
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t)

export function TypeIcon({ type }: { type: string }) {
  const t = type.toLowerCase()
  const cls = 'size-4 flex-none'
  if (t === 'flight') return <Plane aria-hidden className={cls} />
  if (t === 'train') return <TrainFront aria-hidden className={cls} />
  if (t === 'bus') return <Bus aria-hidden className={cls} />
  if (t === 'ferry') return <Ship aria-hidden className={cls} />
  return null
}

export function LegStrip({ leg, entry, todayIso, fmt, rates, canEdit, onward, onOpen }: {
  leg: Leg | null
  entry: TransportLeg | null
  todayIso: string
  fmt: (n: number) => string
  rates: Record<string, number>
  canEdit: boolean
  onward: boolean
  onOpen: (entry: TransportLeg | null) => void
}) {
  const wayHome = !!leg && leg.to.kind === 'home'
  if (!entry) {
    // The phone's EmptyLegStrip: the route under the words, not beside them.
    return (
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => onOpen(null)}
        className={'flex min-h-11 w-full items-center justify-between gap-2 border-ac2-line px-3.5 py-2 text-left ' + dashed}
      >
        <span className="min-w-0">
          <span className={'block truncate text-base font-semibold ' + (wayHome ? 'text-tx2' : 'text-ac2')}>
            {wayHome ? (onward ? 'Onward' : 'Going home') : 'No transport yet'}
          </span>
          {!wayHome && leg && <span className="block truncate text-[13px] text-tx2">{leg.from.city} → {leg.to.city}</span>}
        </span>
        {wayHome && canEdit && <span className="flex-none text-[15px] font-semibold text-ac">+ Add</span>}
      </button>
    )
  }
  const booked = isBookedStatus(entry.status)
  const money = legMoneyState(entry, todayIso)
  const price = entry.price > 0 ? fmt(toBase(entry.price, entry.cur, rates)) : ''
  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => onOpen(entry)}
      className={
        'grid w-full grid-cols-[1fr_auto] items-center gap-x-3 rounded-[calc(var(--r)-6px)] px-3.5 py-2.5 text-left ' +
        (booked ? 'bg-ac2-soft' : 'border-[1.5px] border-dashed border-ac2-line')
      }
    >
      <span className="flex min-w-0 items-center gap-1.5 text-base font-medium text-ac2-deep">
        <TypeIcon type={entry.type} />
        <span className="truncate">
          {cap(entry.type)}
          {entry.date ? ` · ${fmtDay(entry.date)}` : ''}
          {entry.time ? ` ${entry.time}` : ''}
        </span>
      </span>
      {price ? <span className="text-base font-semibold tabular-nums">{price}</span> : <span />}
      {/* The connection is a place you pass through, drawn on the globe as a dogleg with the hours on it (#58). Its own line, so the price never squeezes it. */}
      <span className="col-span-2 block truncate text-[13px] text-tx2">
        {!leg ? `${entry.from} → ${entry.to} · ` : ''}
        {entry.via ? `via ${entry.via}${entry.hours ? ` · ${fmtHours(entry.hours)}` : ''} · ` : ''}
        <span className={TONE[money.tone]}>{money.label}</span>
      </span>
    </button>
  )
}
