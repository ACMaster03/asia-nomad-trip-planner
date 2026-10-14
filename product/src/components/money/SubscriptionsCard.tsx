'use client'
import { useState } from 'react'
import { Bell, BellOff, ChevronDown, ChevronRight, ChevronUp, Minus, Plus } from 'lucide-react'
import { toBase } from '@/lib/trips/format'
import { dayDiff } from '@/lib/trips/reminders'
import { approxMoney, inDays } from '@/lib/trips/moneyText'
import { cadenceLabel, isCancelled, leadLabel, monthlyRunRate, nextCharge, ordinalDay, shortDate } from '@/lib/trips/subscriptions'
import type { Subscription } from '@/lib/trips/types'
import { CardLabel } from './CardLabel'

// Subscriptions (#37; the phone's SubscriptionsCard, Patrik, 29 Sep): Latest's
// pattern, the three that charge next, always open. The rest sit behind "All
// subscriptions", which opens them in place here until round 4b gives them the
// phone's page of their own. The bell is per subscription: most of these you
// never want told about and one or two you do. Cancelled is a STATE, never a
// delete: every past charge stays in history.

export function SubscriptionsCard({ subs, rates, fmt, todayIso, canEdit, onAdd, onEdit, onToggleRemind }: {
  subs: Subscription[]
  rates: Record<string, number>
  fmt: (n: number) => string
  todayIso: string
  canEdit: boolean
  onAdd: () => void
  onEdit: (sub: Subscription) => void
  onToggleRemind: (sub: Subscription) => void
}) {
  const [all, setAll] = useState(false)
  const next = (s: Subscription) => (isCancelled(s) ? null : nextCharge(s, todayIso))
  // Active ones, the next charge first; cancelled ones, the latest first.
  const active = subs.filter((s) => !isCancelled(s)).sort((a, b) => (next(a) ?? '9999').localeCompare(next(b) ?? '9999'))
  const cancelled = subs.filter(isCancelled).sort((a, b) => (b.cancelledOn ?? '').localeCompare(a.cancelledOn ?? ''))
  const monthly = monthlyRunRate(active, rates)
  const more = active.length > 3 || cancelled.length > 0
  const shown = all ? [...active, ...cancelled] : active.slice(0, 3)

  const row = (sub: Subscription) => {
    const off = isCancelled(sub)
    const n = next(sub)
    const soon = n ? dayDiff(todayIso, n) : null
    const on = !!sub.remind && !off
    const detail = off
      ? <span className="text-tx2">cancelled {shortDate(sub.cancelledOn!)}</span>
      : soon !== null && soon <= 7
        ? <b className="text-warn">{inDays(soon)}</b>
        : <span className="text-tx2">{sub.everyMonths === 1 ? `on ${ordinalDay(sub.anchor)}` : n ? `next ${shortDate(n)}` : ''}</span>
    const bell = (
      <span className={'flex size-[34px] flex-none items-center justify-center rounded-full ' + (on ? 'bg-ac2-soft text-ac2-deep' : 'bg-fill text-tx3')}>
        {off ? <Minus aria-hidden className="size-[14px]" strokeWidth={2.6} /> : on ? <Bell aria-hidden className="size-[14px]" strokeWidth={2.6} /> : <BellOff aria-hidden className="size-[14px]" strokeWidth={2.6} />}
      </span>
    )
    return (
      <div key={sub.id} className="flex items-start gap-3 py-2">
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

  const addButton = canEdit && (
    <button type="button" onClick={onAdd} className="mt-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--rCtl)] bg-ac2-soft px-4 text-[15px] font-semibold text-ac2-deep">
      <Plus aria-hidden className="size-4" strokeWidth={2.6} /> Subscription
    </button>
  )
  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf px-4 py-3 text-tx">
      <div className="flex items-center justify-between gap-3 pb-1">
        <CardLabel mauve>Subscriptions</CardLabel>
        {subs.length > 0 && (
          <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="flex items-center gap-0.5 text-[13.5px] font-medium text-ac">
            All subscriptions {all ? <ChevronUp aria-hidden className="size-[14px]" /> : <ChevronDown aria-hidden className="size-[14px]" />}
          </button>
        )}
      </div>
      {subs.length === 0 ? (
        <div className="py-1.5">
          <p className="text-[14px] text-tx2">
            {canEdit ? 'No subscriptions yet. Add the ones that keep charging from home, like Netflix or iCloud, and each charge adds itself on its day.' : 'No subscriptions recorded yet.'}
          </p>
          {addButton}
        </div>
      ) : active.length === 0 && !all ? (
        <p className="py-2.5 text-[14px] text-tx2">None active. The cancelled ones are under All subscriptions.</p>
      ) : (
        <div className="divide-y divide-ln">
          {shown.map(row)}
          <div className="flex justify-between pt-2.5 text-[13.5px] text-tx2">
            <span>{active.length} active</span>
            <span>{approxMoney(monthly, fmt)} a month</span>
          </div>
        </div>
      )}
      {subs.length > 0 && (all || !more) && addButton}
    </div>
  )
}
