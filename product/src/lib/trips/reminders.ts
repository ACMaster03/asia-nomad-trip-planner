import type { TripState } from './types'
import { fmtMoney, segNights, toBase } from './format'

// Reminders (handoff frames 25–26, rig: Interactive Phone "REMINDERS").
//
// Two kinds reach the screens:
//   'mine'  — reminders the user typed (state.reminders). Tickable: ticking
//             sets doneOn, which removes the row from Home but keeps it on
//             /reminders under Done.
//   'money' — DERIVED, never stored: chosen stays with cancelUntil become
//             "Free cancellation ends", chosen stays with chargeDate become
//             "Card charged · {amount}". They carry a mauve dot instead of a
//             tick circle — change the stay and they follow.
//
// Rig rules carried over:
//   - a money deadline that has passed is history, not an outstanding action —
//     it can never be ticked, so it must never sit in Overdue. It is dropped.
//   - an undated 'mine' reminder never shows on Home; on /reminders it lists
//     under Next with the label "no date".
//   - overdue only applies to undone 'mine' reminders.

export type ReminderKind = 'mine' | 'money'

export interface ReminderItem {
  id: string
  kind: ReminderKind
  title: string
  sub: string
  due: string | null // ISO date, null = undated ('mine' only)
  done: boolean
  doneOn: string | null // 'mine' only — when it was ticked
  overdue: boolean // 'mine' only, undone + date in the past
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "14 Aug" — the rig's shortDate. UTC parse, like dayDiff. */
export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** Whole days from `fromIso` to `toIso` (negative = past). Both plain ISO dates. */
export const dayDiff = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000)

/**
 * The rig's due format: "17 Sep · in 5 days" / "· today" / "· tomorrow",
 * overdue "was due 8 Sep · 4 days ago". Undated → "no date".
 */
export function dueLabel(due: string | null | undefined, todayIso: string): string {
  if (!due) return 'no date'
  const days = dayDiff(todayIso, due)
  if (days < 0) {
    const n = -days
    return `was due ${shortDate(due)} · ${n} ${n === 1 ? 'day' : 'days'} ago`
  }
  const rel = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
  return `${shortDate(due)} · ${rel}`
}

/**
 * Merge stored user reminders with derived money deadlines, sorted by due date
 * ascending (undated last). Money deadlines already in the past are dropped —
 * see the header comment.
 */
export function deriveReminders(state: TripState, todayIso: string): ReminderItem[] {
  const items: ReminderItem[] = []

  for (const r of state.reminders ?? []) {
    const due = r.due ?? null
    const doneOn = r.doneOn ?? null
    items.push({
      id: r.id,
      kind: 'mine',
      title: r.title,
      sub: 'your reminder',
      due,
      done: !!doneOn,
      doneOn,
      overdue: !doneOn && !!due && dayDiff(todayIso, due) < 0,
    })
  }

  const base = state.meta.baseCurrency || 'HUF'
  for (const st of state.stays) {
    // Chosen stays only — the same include the budget's "committed" view
    // trusts. A shortlist idea with a cancel date is not money on the line.
    if (!st.include) continue
    const seg = state.segments.find((sg) => sg.id === st.segId)
    const nights = st.nights != null ? st.nights : seg ? segNights(seg) : 0
    const amount = fmtMoney(toBase(st.ppn, st.cur, state.rates) * nights, base)
    const name = st.name || 'Stay'
    if (st.cancelUntil && dayDiff(todayIso, st.cancelUntil) >= 0) {
      items.push({
        id: `money-cancel-${st.id}`,
        kind: 'money',
        title: 'Free cancellation ends',
        sub: `${name} · ${amount} committed after this`,
        due: st.cancelUntil,
        done: false,
        doneOn: null,
        overdue: false,
      })
    }
    if (st.chargeDate && dayDiff(todayIso, st.chargeDate) >= 0) {
      items.push({
        id: `money-charge-${st.id}`,
        kind: 'money',
        title: `Card charged · ${amount}`,
        sub: `${name} · from your booking`,
        due: st.chargeDate,
        done: false,
        doneOn: null,
        overdue: false,
      })
    }
  }

  return items.sort((a, b) => {
    if (a.due === b.due) return a.title.localeCompare(b.title)
    if (a.due === null) return 1
    if (b.due === null) return -1
    return a.due.localeCompare(b.due)
  })
}

/**
 * Home · live "Coming up" rule (frame 08): undone, dated, due within a week or
 * overdue — overdue first, then soonest. The caller slices to its row budget.
 */
export function comingUp(items: ReminderItem[], todayIso: string): ReminderItem[] {
  return items
    .filter((r) => !r.done && r.due !== null && (r.overdue || dayDiff(todayIso, r.due) <= 7))
    .sort((a, b) => (a.overdue === b.overdue ? a.due!.localeCompare(b.due!) : a.overdue ? -1 : 1))
}

/**
 * Home · pre-trip "Before you fly" rule (frame 07): dated and due before the
 * trip starts, undone first, then by date. Everything else (later, or undated)
 * is the "N more later" count on the forward card.
 */
export function beforeYouFly(items: ReminderItem[], startDate: string | undefined) {
  const pre = startDate
    ? items.filter((r) => r.due !== null && r.due < startDate)
    : items.filter((r) => r.due !== null)
  pre.sort((a, b) => (a.done === b.done ? a.due!.localeCompare(b.due!) : a.done ? 1 : -1))
  const laterCount = items.filter((r) => !pre.includes(r) && !r.done).length
  return { pre, laterCount }
}
