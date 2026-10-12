'use client'
import Link from 'next/link'
import { Bell, CalendarClock, ChevronRight, CreditCard } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripRole } from '@/lib/trips/useTripRole'
import { comingUp, deriveReminders, reminderLine, shortDate, type ReminderItem } from '@/lib/trips/reminders'
import type { TripState } from '@/lib/trips/types'

// Home's reminders card, as the phone draws it (ios/Livhold/Home/HomeScreen.swift
// RemindersCard, ios/Livhold/Home/Reminders.swift ReminderRow). One card, two
// names (Patrik, 2 Oct): "Before you fly" before the journey, up to five rows
// dated before departure; "Coming up" on it, up to two rows due within a week
// or overdue. Your own reminders tick; money ones carry their amount on the
// right. When nothing is due the card shrinks to one row that names the next
// reminder and opens the page, so the door never depends on there being a
// reminder (#60, Patrik, 27 Sep).
//
// On the phone a money row opens the stay's or the subscription's own form.
// On the web those forms live on Trip and Money, so the row is plain here
// until round 3c (docs/WEB-IOS-REDESIGN.md).

// A 24px circle (the phone's) inside a 44px tap target; the negative margins
// keep the layout where the bare circle sits (handoff README: 44px min hit
// targets). Open: a 2px ring, amber when overdue. Done: filled, with a tick.
export function TickCircle({ r, canEdit, onTick }: { r: ReminderItem; canEdit: boolean; onTick: () => void }) {
  return (
    <button
      type="button"
      aria-label={r.done ? 'Mark as not done' : 'Mark as done'}
      aria-pressed={r.done}
      disabled={!canEdit}
      onClick={onTick}
      className="-m-2.5 flex size-11 flex-none items-center justify-center"
    >
      <span
        aria-hidden
        className={
          'flex size-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-[180ms] ' +
          (r.done ? 'bg-ac text-on' : 'border-2 text-transparent ' + (r.overdue ? 'border-warn' : 'border-ln3'))
        }
      >
        ✓
      </span>
    </button>
  )
}

function useTick(todayIso: string) {
  const mut = useTripMutation()
  return {
    mut,
    tick: (id: string) =>
      mut.mutate((st) => ({
        ...st,
        reminders: (st.reminders ?? []).map((r) =>
          r.id === id ? { ...r, doneOn: r.doneOn ? null : todayIso } : r,
        ),
      })),
  }
}

/** One reminder: your own with a tick circle, a money one with an icon and its amount. */
function ReminderRow({ r, todayIso, canEdit, onTick }: { r: ReminderItem; todayIso: string; canEdit: boolean; onTick: () => void }) {
  const Icon = r.kind === 'cancel' ? CalendarClock : CreditCard
  return (
    <div className="flex items-start gap-3 py-[11px]">
      {r.kind === 'mine' ? (
        <TickCircle r={r} canEdit={canEdit} onTick={onTick} />
      ) : (
        <span className="flex size-6 flex-none items-center justify-center text-tx3">
          <Icon aria-hidden className="size-[14px]" strokeWidth={2.2} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={'block text-base font-semibold ' + (r.done ? 'text-tx2' : 'text-tx')}>{r.title}</span>
        <span className={'mt-0.5 block text-[14px] ' + (r.overdue && !r.done ? 'text-warn' : 'text-tx2')}>
          {reminderLine(r, todayIso)}
        </span>
      </span>
      {r.amount && (
        <span className="flex-none pt-px text-right">
          <span className="block text-[15px] font-semibold tabular-nums text-tx">{r.amount}</span>
          {r.caption && <span className="block text-[12.5px] text-tx2">{r.caption}</span>}
        </span>
      )}
    </div>
  )
}

export function RemindersCard({ state, todayIso, mode }: { state: TripState; todayIso: string; mode: 'beforeYouFly' | 'comingUp' }) {
  const { tick } = useTick(todayIso)
  const { canEdit } = useTripRole()
  const flash = useToast()

  const all = deriveReminders(state, todayIso).filter((r) => !r.done)
  const start = state.meta.startDate
  const rows =
    mode === 'beforeYouFly'
      ? all.filter((r) => r.due !== null && (start ? r.due < start : true)).slice(0, 5)
      : comingUp(all, todayIso).slice(0, 2)

  // "Reminders · next 14 Oct · iCloud 2 TB ›": nothing is due, but the page is one tap away.
  if (rows.length === 0) {
    const next = all.find((r) => r.due !== null && r.due >= todayIso)
    return (
      <Link href="/reminders" className="lv-enter flex items-center gap-2.5 rounded-[var(--r)] bg-sf px-[18px] py-[15px] text-tx">
        <Bell aria-hidden className="size-[14px] flex-none text-ac2-deep" strokeWidth={2.4} />
        <span className="min-w-0 flex-1 truncate text-[15px] text-tx2">
          <span className="font-semibold text-tx">Reminders</span>
          {next ? ` · next ${shortDate(next.due!)} · ${next.title}` : ' · nothing coming up'}
        </span>
        <ChevronRight aria-hidden className="size-3 flex-none text-tx3" strokeWidth={2.6} />
      </Link>
    )
  }

  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] pb-0.5 pt-4 text-tx">
      <div className="pb-1 text-[12.5px] font-semibold uppercase tracking-[.112em] text-ac2-deep">
        {mode === 'beforeYouFly' ? 'Before you fly' : 'Coming up'}
      </div>
      {rows.map((r, i) => (
        <div key={r.id} className={i > 0 ? 'border-t border-ln' : ''}>
          <ReminderRow
            r={r}
            todayIso={todayIso}
            canEdit={canEdit}
            onTick={() => {
              tick(r.id)
              flash('Ticked · it’s under Done')
            }}
          />
        </div>
      ))}
      <Link href="/reminders" className="flex items-center gap-3 border-t border-ln py-[13px]">
        <span className="flex-1 text-[15px] font-medium text-tx2">All reminders</span>
        <ChevronRight aria-hidden className="size-3 flex-none text-tx3" strokeWidth={2.6} />
      </Link>
    </div>
  )
}
