'use client'
import { useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { toBase } from '@/lib/trips/format'
import { dayDiff } from '@/lib/trips/reminders'
import {
  cadenceLabel, chargeSoon, isCancelled, leadLabel, monthlyRate, monthlyRunRate, nextCharge, nextChargeFrom, scheduleLabel, shortDate,
} from '@/lib/trips/subscriptions'
import type { LedgerEntry, Subscription } from '@/lib/trips/types'
import { FoldButton, FoldedRow } from './Fold'

// Subscriptions (#37) — the recurring costs from home, the one set of expenses
// that keeps happening whether or not anyone opens the app.
//
// The row says what it costs, when it next lands and whether you will be
// warned. Cadence is DECLARED (subscriptions.ts), so "next charge" is
// arithmetic; the bell is per subscription because most of these you never
// want told about and one or two you do.
//
// Cancelled ones stay listed behind a toggle. Deleting would lose what the
// trip actually paid; cancelling keeps every past charge and stops the
// prediction — the difference the card makes visible by not hiding them
// outright.
//
// On Money it starts folded to one line (Fold.tsx): how many are active, the
// monthly total, and the charge due this week if there is one, in the same
// amber pill the open card uses.

export function SubscriptionsCard({ subs, ledger = [], rates, fmt, todayIso, tripEnd, subsAhead, canEdit, onAdd, onEdit, onToggleRemind, folded, onToggle }: {
  subs: Subscription[]
  /** so a charge already logged (an entry with its subId) is not "today" */
  ledger?: LedgerEntry[]
  rates: Record<string, number>
  fmt: (n: number) => string
  todayIso: string
  tripEnd: string
  /** what they will take between tomorrow and the end of the trip (moneyModel) */
  subsAhead: number
  canEdit: boolean
  onAdd: () => void
  onEdit: (sub: Subscription) => void
  onToggleRemind: (sub: Subscription) => void
  /** with onToggle: one line, or the card with ⌃ (Fold.tsx) */
  folded?: boolean
  onToggle?: () => void
}) {
  const [showCancelled, setShowCancelled] = useState(false)
  const live = subs.filter((s) => !isCancelled(s))
  const dead = subs.filter(isCancelled)
  const runRate = monthlyRunRate(subs, rates)
  const daysLeft = tripEnd ? Math.max(0, dayDiff(todayIso, tripEnd)) : 0

  if (!subs.length) {
    return (
      <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] py-4 text-tx">
        <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">Subscriptions</div>
        <p className="mt-1.5 text-base text-tx2">
          {canEdit
            ? 'Repeating costs, like Netflix or iCloud.'
            : 'Nothing recurring recorded yet.'}
        </p>
        {canEdit && (
          <button onClick={onAdd} className="mt-3 rounded-[var(--rCtl)] bg-ac2-soft px-[18px] py-2.5 text-base font-semibold text-ac2-deep">
            ＋ Subscription
          </button>
        )}
      </div>
    )
  }

  const when = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`)
  const pill = 'inline-block whitespace-nowrap rounded-full bg-warn-soft px-2 py-[1px] text-[12px] font-bold text-warn'
  if (folded && onToggle) {
    const soon = chargeSoon(subs, todayIso, 7, ledger)
    return (
      <FoldedRow
        title="Subscriptions"
        onOpen={onToggle}
        summary={<>
          {live.length ? `${live.length} active · ≈ ${fmt(runRate)} a month` : 'none active'}
          {soon && <> · {soon.sub.label} <b className={pill}>{when(soon.inDays)}</b></>}
        </>}
      />
    )
  }

  const row = (sub: Subscription) => {
    const off = isCancelled(sub)
    const next = off ? null : nextCharge(sub, nextChargeFrom(sub, todayIso, ledger))
    const soon = next ? dayDiff(todayIso, next) : null
    const per = toBase(monthlyRate(sub), sub.cur, rates)
    const remind = !!sub.remind && !off
    return (
      <div key={sub.id} className="flex items-start gap-3 border-t border-ln py-2.5">
        {canEdit && !off ? (
          <button
            type="button"
            onClick={() => onToggleRemind(sub)}
            aria-pressed={remind}
            aria-label={remind ? `Reminder on, ${leadLabel(sub.leadDays ?? 3)} — turn off` : 'Reminder off — turn on'}
            className={
              'mt-0.5 flex size-9 flex-none items-center justify-center rounded-full ' +
              (remind ? 'bg-ac2-soft text-ac2-deep' : 'bg-inp text-tx3')
            }
          >
            {remind ? <Bell aria-hidden className="size-[18px]" /> : <BellOff aria-hidden className="size-[18px]" />}
          </button>
        ) : (
          <span className="mt-0.5 flex size-9 flex-none items-center justify-center rounded-full bg-inp text-tx3">
            {off ? '—' : remind ? <Bell aria-hidden className="size-[18px]" /> : <BellOff aria-hidden className="size-[18px]" />}
          </span>
        )}
        <span
          role={canEdit ? 'button' : undefined}
          tabIndex={canEdit ? 0 : undefined}
          onClick={canEdit ? () => onEdit(sub) : undefined}
          onKeyDown={canEdit ? (ev) => { if (ev.key === 'Enter') onEdit(sub) } : undefined}
          className={'flex min-w-0 flex-1 items-start justify-between gap-3 ' + (canEdit ? 'cursor-pointer' : '')}
        >
          <span className="min-w-0">
            <span className={'block text-base font-semibold' + (off ? ' text-tx3 line-through' : '')}>{sub.label}</span>
            <span className="block text-[14px] text-tx2">
              {off ? (
                <>cancelled {shortDate(sub.cancelledOn!)}</>
              ) : (
                <>
                  {scheduleLabel(sub, todayIso)}
                  {remind && ` · reminds ${leadLabel(sub.leadDays ?? 3)}`}
                  {soon !== null && soon <= 7 && (
                    <b className={'ml-1.5 ' + pill}>{when(soon)}</b>
                  )}
                </>
              )}
            </span>
          </span>
          <span className="flex-none text-right">
            <span className={'block text-base font-semibold' + (off ? ' text-tx3' : '')}>
              {fmt(toBase(sub.amount, sub.cur, rates))}
            </span>
            <span className="block text-[13px] text-tx2">
              {cadenceLabel(sub)}
              {sub.everyMonths !== 1 && per > 0 ? ` · ${fmt(per)}/mo` : ''}
            </span>
          </span>
        </span>
      </div>
    )
  }

  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] pb-2 pt-1.5 text-tx">
      <div className="flex items-center justify-between border-b border-ln py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">Subscriptions</span>
        <span className="flex items-center gap-1">
          <span className="text-[13px] text-tx3">repeating costs</span>
          {onToggle && <FoldButton label="Subscriptions" onFold={onToggle} />}
        </span>
      </div>
      {live.map(row)}
      {showCancelled && dead.map(row)}
      {dead.length > 0 && (
        <button
          type="button"
          onClick={() => setShowCancelled((v) => !v)}
          className="w-full border-t border-ln py-2.5 text-left text-[13px] font-semibold text-ac2-deep"
        >
          {showCancelled ? 'Hide cancelled' : `Show cancelled (${dead.length})`}
        </button>
      )}
      <div className="flex items-baseline justify-between gap-3 border-t border-ln pt-2.5 text-base">
        <span className="text-tx2">{live.length} active</span>
        <b>≈ {fmt(runRate)} / month</b>
      </div>
      {daysLeft > 0 && (
        <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px] text-tx2">
          <span>across the {daysLeft} days left</span>
          <b>≈ {fmt(subsAhead)}</b>
        </div>
      )}
      {canEdit && (
        <button onClick={onAdd} className="mb-1 mt-3 rounded-[var(--rCtl)] bg-ac2-soft px-[18px] py-2.5 text-base font-semibold text-ac2-deep">
          ＋ Subscription
        </button>
      )}
    </div>
  )
}
