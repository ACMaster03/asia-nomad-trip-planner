'use client'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripRole } from '@/lib/trips/useTripRole'
import { beforeYouFly, comingUp, deriveReminders, dueLabel, type ReminderItem } from '@/lib/trips/reminders'
import type { TripState } from '@/lib/trips/types'

// Home's two reminder slots (DashboardClient mounts these):
//   <BeforeYouFly> — pre-trip (frame 07): section header + ＋ Reminder pill,
//     the deadline card (due-before-start, undone first, max 5) and the
//     "All reminders · N more later" forward card.
//   <ComingUp>     — live/arrive/off (frame 08): max 2 soon/overdue rows with
//     an "All reminders" footer. Ticking toasts and the row leaves Home but
//     stays under Done on /reminders.
// Self-contained (own mutation/role/toast) so DashboardClient's insertions
// stay single lines.

const kicker = 'text-base font-semibold uppercase tracking-[.12em] text-ac2-deep'

// 26px circle (rig-spec visual) inside a 44px tap target; the negative margin
// keeps the layout exactly where the bare circle sat (handoff README: 44px min
// hit targets).
export function TickCircle({
  r,
  canEdit,
  onTick,
}: {
  r: ReminderItem
  canEdit: boolean
  onTick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={r.done ? 'Mark as not done' : 'Mark as done'}
      aria-pressed={r.done}
      disabled={!canEdit}
      onClick={onTick}
      className="-m-[9px] flex size-11 flex-none items-center justify-center"
    >
      <span
        aria-hidden
        className={
          'flex h-[26px] w-[26px] items-center justify-center rounded-full text-base font-semibold transition-colors duration-[180ms] ' +
          (r.done ? 'bg-ac text-on' : 'border-2 text-transparent ' + (r.overdue ? 'border-warn' : 'border-ln3'))
        }
      >
        ✓
      </span>
    </button>
  )
}

const MoneyDot = () => <span aria-hidden className="mt-[9px] h-2 w-2 flex-none rounded-full bg-ac2" />

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

/* ── pre-trip: "Before you fly" (frame 07) ── */
export function BeforeYouFly({ state, todayIso }: { state: TripState; todayIso: string }) {
  const { tick } = useTick(todayIso)
  const { canEdit } = useTripRole()
  const all = deriveReminders(state, todayIso)
  const { pre, laterCount } = beforeYouFly(all, state.meta.startDate)
  const rows = pre.slice(0, 5)

  return (
    <>
      <div className="mt-1.5 flex items-center justify-between gap-2.5">
        <span className={kicker}>Before you fly</span>
        {canEdit && (
          <Link href="/reminders" className="rounded-full bg-ac2-soft px-[13px] py-[7px] text-base font-semibold text-ac2-deep">
            ＋ Reminder
          </Link>
        )}
      </div>
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-[var(--r)] bg-sf text-tx">
          {rows.map((r, i) => {
            const d = new Date(r.due! + 'T00:00:00Z')
            const mon = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()
            return (
              <div
                key={r.id}
                className={'flex items-start gap-[13px] px-4 py-[15px] ' + (i === rows.length - 1 ? '' : 'border-b border-ln')}
              >
                <span className="min-w-[42px] flex-none text-center">
                  <span className="block text-[17px] font-semibold">{String(d.getUTCDate()).padStart(2, '0')}</span>
                  <span className="block text-base tracking-[.08em] text-tx2">{mon}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={'block text-base ' + (r.done ? 'font-medium text-tx2' : 'font-semibold')}>{r.title}</span>
                  <span className="mt-0.5 block text-base text-tx2">{r.sub}</span>
                </span>
                {r.kind === 'mine' ? (
                  <TickCircle r={r} canEdit={canEdit} onTick={() => tick(r.id)} />
                ) : (
                  <MoneyDot />
                )}
              </div>
            )
          })}
        </div>
      )}
      <Link href="/reminders" className="flex items-center gap-3 rounded-[var(--r)] bg-sf p-4 text-tx">
        <span className="flex-1 text-base font-medium text-tx2">
          All reminders{laterCount > 0 ? ` · ${laterCount} more later` : ''}
        </span>
        <ChevronRight aria-hidden className="size-5 text-ac2" />
      </Link>
    </>
  )
}

/* ── live / arrive / off: "Coming up" (frame 08) ── */
export function ComingUp({ state, todayIso }: { state: TripState; todayIso: string }) {
  const { tick } = useTick(todayIso)
  const { canEdit } = useTripRole()
  const flash = useToast()

  const rows = comingUp(deriveReminders(state, todayIso), todayIso).slice(0, 2)
  if (rows.length === 0) return null

  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf p-[18px] text-tx">
      <div className={kicker}>Coming up</div>
      {rows.map((r, i) => (
        <div key={r.id} className={'flex items-start gap-3 pt-3.5 ' + (i === 0 ? 'mt-0' : 'mt-3.5 border-t border-ln')}>
          {r.kind === 'mine' ? (
            <TickCircle
              r={r}
              canEdit={canEdit}
              onTick={() => {
                tick(r.id)
                flash('Ticked - gone from Home, still under Done')
              }}
            />
          ) : (
            <MoneyDot />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold">{r.title}</span>
            <span className={'mt-0.5 block text-base ' + (r.overdue ? 'text-warn' : 'text-tx2')}>
              {dueLabel(r.due, todayIso)}
            </span>
          </span>
        </div>
      ))}
      <Link href="/reminders" className="mt-3.5 flex items-center gap-3 border-t border-ln pt-3.5">
        <span className="flex-1 text-base font-medium text-ac2-deep">All reminders</span>
        <ChevronRight aria-hidden className="size-5 text-ac2" />
      </Link>
    </div>
  )
}
