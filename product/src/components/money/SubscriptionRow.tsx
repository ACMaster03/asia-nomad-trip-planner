'use client'
import { Bell, BellOff, ChevronRight, Minus, Plus } from 'lucide-react'
import { toBase } from '@/lib/trips/format'
import { dayDiff } from '@/lib/trips/reminders'
import { inDays } from '@/lib/trips/moneyText'
import { cadenceLabel, isCancelled, leadLabel, nextCharge, ordinalDay, shortDate } from '@/lib/trips/subscriptions'
import type { Subscription } from '@/lib/trips/types'

// One subscription (the phone's SubscriptionRow, round 4b): the bell, the
// name, when it charges next, the amount. A tap opens its form; the bell is
// per subscription, one tap on or off, because most of these you never want
// told about and one or two you do. Cancelled is a STATE, never a delete:
// struck through, and every past charge stays in history.
export function SubscriptionRow({ sub, rates, fmt, todayIso, canEdit, onEdit, onToggleRemind }: {
  sub: Subscription
  rates: Record<string, number>
  fmt: (n: number) => string
  todayIso: string
  canEdit: boolean
  onEdit: (sub: Subscription) => void
  onToggleRemind: (sub: Subscription) => void
}) {
  const off = isCancelled(sub)
  const next = off ? null : nextCharge(sub, todayIso)
  const soon = next ? dayDiff(todayIso, next) : null
  const on = !!sub.remind && !off
  // Within a week, how soon says it better than the date (Patrik, 29 Sep).
  const detail = off
    ? <span className="text-tx2">cancelled {shortDate(sub.cancelledOn!)}</span>
    : soon !== null && soon <= 7
      ? <b className="text-warn">{inDays(soon)}</b>
      : <span className="text-tx2">{sub.everyMonths === 1 ? `on ${ordinalDay(sub.anchor)}` : next ? `next ${shortDate(next)}` : ''}</span>
  const bell = (
    <span className={'flex size-[34px] flex-none items-center justify-center rounded-full ' + (on ? 'bg-ac2-soft text-ac2-deep' : 'bg-fill text-tx3')}>
      {off ? <Minus aria-hidden className="size-[14px]" strokeWidth={2.6} /> : on ? <Bell aria-hidden className="size-[14px]" strokeWidth={2.6} /> : <BellOff aria-hidden className="size-[14px]" strokeWidth={2.6} />}
    </span>
  )
  return (
    <div className="flex items-start gap-3 py-2">
      {canEdit && !off ? (
        <button type="button" onClick={() => onToggleRemind(sub)} aria-pressed={on} aria-label={on ? `Reminder on, ${leadLabel(sub.leadDays ?? 3)}. Turn off` : 'Reminder off. Turn on'}>{bell}</button>
      ) : bell}
      <button type="button" disabled={!canEdit} onClick={() => onEdit(sub)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
        <span className="min-w-0 flex-1">
          <span className={'block truncate text-[15px] font-medium ' + (off ? 'text-tx3 line-through' : 'text-tx')}>{sub.label}</span>
          <span className="block text-[12.5px]">{detail}</span>
        </span>
        <span className="flex-none text-right">
          <span className={'block text-[15px] font-semibold tabular-nums ' + (off ? 'text-tx3' : 'text-tx')}>{fmt(toBase(sub.amount, sub.cur, rates))}</span>
          <span className="block text-[12.5px] text-tx2">{cadenceLabel(sub)}</span>
        </span>
        {canEdit && <ChevronRight aria-hidden className="mt-1 size-[13px] flex-none text-tx3" strokeWidth={2.6} />}
      </button>
    </div>
  )
}

/** Nothing yet: what a subscription is here, and the way to add one (the phone's SubscriptionsEmpty). */
export function SubscriptionsEmpty({ canEdit, onAdd }: { canEdit: boolean; onAdd: () => void }) {
  return (
    <div className="py-1.5">
      <p className="text-[14px] text-tx2">
        {canEdit ? 'No subscriptions yet. Add the ones that keep charging from home, like Netflix or iCloud, and each charge adds itself on its day.' : 'No subscriptions recorded yet.'}
      </p>
      {canEdit && (
        <button type="button" onClick={onAdd} className="mt-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--rCtl)] bg-ac2-soft px-4 text-[15px] font-semibold text-ac2-deep">
          <Plus aria-hidden className="size-4" strokeWidth={2.6} /> Subscription
        </button>
      )}
    </div>
  )
}
