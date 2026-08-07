'use client'
import { useState } from 'react'
import { Sheet } from '../live/Sheet'
import type { TripState, UserReminder } from '@/lib/trips/types'

// "New reminder" bottom sheet — handoff frame 26. One field, one optional
// date, quick chips for the common picks. Saving appends to state.reminders
// via the caller's rev-guarded mutation.

const uid = (p: string) => p + crypto.randomUUID()
const label = 'block min-w-0 text-base font-medium text-tx2'
const input =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base font-medium text-tx outline-none transition-colors duration-[180ms] focus:border-ac'
const chip = 'rounded-full bg-ac2-soft px-[13px] py-2 text-base font-medium text-ac2-deep'

export function AddReminderSheet({
  state,
  todayIso,
  onClose,
  onSave,
}: {
  state: TripState
  todayIso: string
  onClose: () => void
  onSave: (r: UserReminder) => void
}) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')

  // "Before {city} ends" — the stop you are in right now, or the next one.
  const stops = state.segments
    .filter((sg) => sg.include !== false)
    .slice()
    .sort((a, b) => a.arrive.localeCompare(b.arrive))
  const anchor =
    stops.find((sg) => sg.arrive <= todayIso && todayIso <= sg.depart) ??
    stops.find((sg) => sg.arrive > todayIso)

  const inAWeek = () => {
    const d = new Date(todayIso + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 7)
    setDue(d.toISOString().slice(0, 10))
  }

  return (
    <Sheet label="New reminder" onClose={onClose}>
      <h2 className="font-serif text-[21px] font-semibold">New reminder</h2>
      <label className={label}>
        Remind me to…
        <input
          className={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Extend the Thai visa"
        />
      </label>
      <div>
        <label className={label}>
          Date <span className="font-normal text-tx3">- optional</span>
          <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <div className="mt-[9px] flex flex-wrap gap-[7px]">
          <button type="button" className={chip} onClick={inAWeek}>
            In a week
          </button>
          {anchor && (
            <button type="button" className={chip} onClick={() => setDue(anchor.depart)}>
              Before {anchor.city} ends
            </button>
          )}
          <button type="button" className={chip} onClick={() => setDue('')}>
            No date
          </button>
        </div>
      </div>
      <p className="text-base leading-normal text-tx2">
        Dated reminders appear on Home from 7 days before, and stay after the date until you tick them.
      </p>
      <button
        onClick={() => {
          if (!title.trim()) return
          onSave({ id: uid('rm'), title: title.trim(), due: due || null })
        }}
        disabled={!title.trim()}
        className="rounded-[var(--r)] bg-ac py-4 text-base font-semibold text-on disabled:opacity-50"
      >
        Save reminder
      </button>
    </Sheet>
  )
}
