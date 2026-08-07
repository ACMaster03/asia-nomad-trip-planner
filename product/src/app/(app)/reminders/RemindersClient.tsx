'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripRole } from '@/lib/trips/useTripRole'
import { tripPhase } from '@/lib/trips/recap'
import { deriveReminders, dueLabel, shortDate, type ReminderItem } from '@/lib/trips/reminders'
import { SaveError } from '@/components/trips/SaveError'
import { ViewerNotice } from '@/components/trips/ViewerNotice'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { useToast } from '@/components/Toast'
import { AddReminderSheet } from './AddReminderSheet'
import { TickCircle } from './HomeReminders'

// /reminders — handoff frames 25 (list) + 26 (add sheet).
//
// One flat feature: the merged list from reminders.ts grouped Overdue → Next →
// Done. 'mine' rows carry the 26px tick circle (ticking toggles doneOn, which
// is what removes them from Home); 'money' rows carry the mauve dot and no
// affordance — change the stay and they follow. Post-trip, anything still
// unticked is hidden; the Done list stays (rig rule).

const groupHead = (warn: boolean) =>
  'text-base font-semibold uppercase tracking-[.12em] ' + (warn ? 'text-warn' : 'text-tx2')

export default function RemindersClient() {
  const { trip } = useTripScreen()
  const mut = useTripMutation()
  const { canEdit } = useTripRole()
  const toast = useToast()
  const [addOpen, setAddOpen] = useState(false)

  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />
  const s = trip.data.state

  const todayIso = new Date().toISOString().slice(0, 10)
  const postTrip = tripPhase(s, todayIso) === 'post'
  const all = deriveReminders(s, todayIso)
  const overdue = postTrip ? [] : all.filter((r) => !r.done && r.overdue)
  const next = postTrip ? [] : all.filter((r) => !r.done && !r.overdue)
  const done = all.filter((r) => r.done)

  const tick = (id: string) =>
    mut.mutate((st) => ({
      ...st,
      reminders: (st.reminders ?? []).map((r) =>
        r.id === id ? { ...r, doneOn: r.doneOn ? null : todayIso } : r,
      ),
    }))

  const row = (r: ReminderItem, last: boolean) => (
    <div key={r.id} className={'flex items-start gap-3 px-4 py-[15px] ' + (last ? '' : 'border-b border-ln')}>
      {r.kind === 'mine' ? (
        <TickCircle
          r={r}
          canEdit={canEdit}
          onTick={() => {
            tick(r.id)
            if (!r.done) toast('Ticked - gone from Home, still under Done')
          }}
        />
      ) : (
        <span aria-hidden className="mx-[9px] mt-[9px] h-2 w-2 flex-none rounded-full bg-ac2" />
      )}
      <span className="min-w-0 flex-1">
        <span className={'block text-base ' + (r.done ? 'font-medium text-tx2' : 'font-semibold')}>{r.title}</span>
        <span className={'mt-0.5 block text-base ' + (r.overdue && !r.done ? 'text-warn' : 'text-tx2')}>
          {r.done ? `done ${r.doneOn ? shortDate(r.doneOn) : 'just now'}` : dueLabel(r.due, todayIso)}
        </span>
      </span>
    </div>
  )

  const group = (title: string, rows: ReminderItem[], warn = false) =>
    rows.length > 0 && (
      <div>
        <div className={groupHead(warn)}>{title}</div>
        <div
          className={
            'mt-2.5 overflow-hidden rounded-[var(--r)] bg-sf ' + (warn ? 'border-[1.5px] border-warn-line' : '')
          }
        >
          {rows.map((r, i) => row(r, i === rows.length - 1))}
        </div>
      </div>
    )

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px]">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          aria-label="Back to Home"
          className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-sf text-tx"
        >
          <ArrowLeft className="size-5" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 font-serif text-xl font-semibold">All reminders</h1>
        {canEdit && (
          <button
            onClick={() => setAddOpen(true)}
            className="flex-none rounded-full bg-ac2-soft px-[13px] py-[7px] text-base font-semibold text-ac2-deep"
          >
            ＋ Add
          </button>
        )}
      </div>
      <ViewerNotice />
      <SaveError show={mut.isError} error={mut.error} />

      {group('Overdue', overdue, true)}
      {group('Next', next)}
      {group('Done', done)}

      {all.length === 0 && (
        <div className="lv-enter rounded-[var(--r)] bg-sf p-[18px] text-base text-tx2">
          Nothing here yet. Your own reminders and booking deadlines (free-cancel and card-charge dates from your
          stays) all land on this one list.
        </div>
      )}

      <div className="rounded-[var(--r)] bg-tag px-4 py-3.5 text-base leading-normal text-tag-ink">
        Ticking one removes it from Home but keeps it here under Done. Booking deadlines can&apos;t be ticked -
        change the stay and they follow.
      </div>

      {addOpen && (
        <AddReminderSheet
          state={s}
          todayIso={todayIso}
          onClose={() => setAddOpen(false)}
          onSave={(r) => {
            mut.mutate((st) => ({ ...st, reminders: [...(st.reminders ?? []), r] }))
            setAddOpen(false)
          }}
        />
      )}
    </main>
  )
}
