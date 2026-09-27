'use client'
import { useMemo, useState } from 'react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { useMoney } from '@/lib/trips/Money'
import { parseAmount, toBase } from '@/lib/trips/format'
import { dayDiff } from '@/lib/trips/reminders'
import { LEAD_CHOICES, cadenceLabel, chargesBetween, leadLabel, nextCharge, ordinalDay, shiftMonths } from '@/lib/trips/subscriptions'
import type { Subscription } from '@/lib/trips/types'

// Add / edit a subscription (#37). The form IS the argument of the issue:
// you declare the amount, the cadence and the day it hangs off, and the app
// derives every date from that. Nothing here infers a schedule from history.
//
// "Mark cancelled" is a state, not a delete: predictions and reminders stop,
// and every charge the trip already paid stays in the ledger and in every
// total it fed. Delete is kept for the subscription typed by mistake, and says
// which of the two you want.

const newId = () => 'sub' + crypto.randomUUID()
const todayISO = () => new Date().toISOString().slice(0, 10)
const label = 'block min-w-0 text-[14px] font-medium text-tx2'
const box =
  'mt-1.5 flex min-h-[52px] w-full items-center rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 text-base text-tx outline-none transition-colors duration-[180ms] focus:border-ac'
const CADENCES = [
  { months: 1, label: 'Monthly' },
  { months: 3, label: 'Every 3 months' },
  { months: 6, label: 'Every 6 months' },
  { months: 12, label: 'Yearly' },
]
const longDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const shortish = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
// A yearly plan's next three charges are all "12 Nov" without this, which
// reads as the same date three times.
const dated = (iso: string, ref: string) => (iso.slice(0, 4) === ref.slice(0, 4) ? shortish(iso) : `${shortish(iso)} ${iso.slice(0, 4)}`)

export function SubscriptionSheet({ initial, rates, todayIso, onSave, onDelete, onClose }: {
  initial: Subscription | null
  rates: Record<string, number>
  todayIso: string
  onSave: (sub: Subscription) => void
  onDelete?: (sub: Subscription) => void
  onClose: () => void
}) {
  const { base, fmt } = useMoney()
  const [name, setName] = useState(initial?.label ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [cur, setCur] = useState(initial?.cur ?? base)
  const [everyMonths, setEveryMonths] = useState(initial?.everyMonths ?? 1)
  const [anchor, setAnchor] = useState(initial?.anchor || todayIso || todayISO())
  const [remind, setRemind] = useState(!!initial?.remind)
  const [leadDays, setLeadDays] = useState(initial?.leadDays ?? 3)
  const [cancelledOn, setCancelledOn] = useState(initial?.cancelledOn ?? null)

  const currencies = Object.keys(rates)
  const amt = parseAmount(amount)
  const valid = isFinite(amt) && amt > 0 && !!anchor && !!name.trim()
  const cancelled = !!cancelledOn

  // The preview is the real derivation, not a mock of it — same function the
  // card, the projection and the alert function all call.
  const draft: Subscription = useMemo(
    () => ({ id: initial?.id ?? 'preview', label: name, cur, amount: isFinite(amt) ? amt : 0, everyMonths, anchor, remind, leadDays, cancelledOn }),
    [initial?.id, name, cur, amt, everyMonths, anchor, remind, leadDays, cancelledOn],
  )
  const next = useMemo(() => (anchor ? nextCharge(draft, todayIso) : null), [draft, anchor, todayIso])
  // The two or three after that, to show the rhythm. One is plenty for a
  // yearly plan; three is the shape of a monthly one.
  const following = useMemo(() => {
    if (!next) return []
    const ahead = everyMonths >= 12 ? 1 : 3
    return chargesBetween(draft, shiftMonths(next, everyMonths), shiftMonths(next, everyMonths * ahead)).slice(0, ahead)
  }, [draft, next, everyMonths])
  const preview = isFinite(amt) && amt > 0 && cur !== base ? fmt(toBase(amt, cur, rates)) : null

  function submit() {
    if (!valid) return
    onSave({
      id: initial?.id ?? newId(),
      label: name.trim(),
      cur: cur || base,
      amount: amt,
      everyMonths,
      anchor,
      ...(remind ? { remind: true, leadDays } : { remind: false }),
      ...(cancelledOn ? { cancelledOn } : {}),
      // The app writes its charges from the day it was added (importCosts.ts):
      // a past anchor is a known charge, not one to write again.
      ...(initial ? (initial.autoFrom ? { autoFrom: initial.autoFrom } : {}) : { autoFrom: todayIso || todayISO() }),
    })
  }

  return (
    <Sheet label={initial ? 'Edit subscription' : 'Add subscription'} onClose={onClose}>
      <h3 className="text-[20px] font-semibold">{initial ? 'Edit subscription' : 'Add subscription'}</h3>

      <label className={label}>
        What is it?
        <input
          autoFocus={!initial}
          className={box}
          placeholder="e.g. iCloud 2 TB, the flat’s internet"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div className="grid grid-cols-[1fr_96px] gap-2.5">
        <label className={label}>
          Amount
          <input
            aria-label="Amount"
            className={box + ' text-[24px] font-semibold'}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className={label}>
          Currency
          <select aria-label="Currency" className={box} value={cur} onChange={(e) => setCur(e.target.value)}>
            {!currencies.includes(cur) && <option value={cur}>{cur}</option>}
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className={label}>
          Repeats
          <select className={box} value={everyMonths} onChange={(e) => setEveryMonths(Number(e.target.value))}>
            {CADENCES.map((c) => <option key={c.months} value={c.months}>{c.label}</option>)}
          </select>
        </label>
        <label className={label}>
          {everyMonths === 1 ? 'Charged on' : 'Last (or next) charge'}
          <input aria-label="Anchor date" type="date" className={box} value={anchor} onChange={(e) => setAnchor(e.target.value)} />
        </label>
      </div>

      <div className="rounded-[var(--rCtl)] bg-inp px-3.5 py-3">
        <div className="text-[12px] font-semibold uppercase tracking-[.09em] text-tx2">
          {cancelled ? 'Cancelled' : 'Next charge'}
        </div>
        {cancelled ? (
          <div className="mt-0.5 text-base font-semibold">
            stopped {shortish(cancelledOn!)} · nothing further predicted
          </div>
        ) : next ? (
          <>
            <div className="mt-0.5 text-base font-semibold">
              {longDate(next)}
              <span className="ml-1.5 rounded-full bg-warn-soft px-2 py-[1px] text-[12px] font-bold text-warn">
                {(() => {
                  const d = dayDiff(todayIso, next)
                  return d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`
                })()}
              </span>
            </div>
            <div className="mt-1 text-[13px] text-tx3">
              {everyMonths === 1 ? `every month on ${ordinalDay(anchor)}` : cadenceLabel({ ...draft, everyMonths })}
              {following.length > 0 && `, then ${following.map((f) => dated(f, next)).join(' · ')}`} — derived, never
              stored
            </div>
          </>
        ) : (
          <div className="mt-0.5 text-base text-tx2">Set a date above and the schedule follows from it.</div>
        )}
      </div>

      {!cancelled && (
        <>
          <label className="flex items-center gap-3 text-base">
            <input
              type="checkbox"
              className="size-5 accent-[var(--ac)]"
              checked={remind}
              onChange={(e) => setRemind(e.target.checked)}
            />
            Remind me before it charges
          </label>
          {remind && (
            <label className={label}>
              Lead time
              <select className={box} value={leadDays} onChange={(e) => setLeadDays(Number(e.target.value))}>
                {LEAD_CHOICES.map((d) => <option key={d} value={d}>{leadLabel(d)}</option>)}
              </select>
              <span className="mt-1 block text-[13px] font-normal text-tx3">
                Email, and a phone buzz if you left deadline push on in Account → Alerts.
              </span>
            </label>
          )}
        </>
      )}

      <button
        onClick={submit}
        disabled={!valid}
        className="w-full rounded-[var(--rCtl)] bg-ac py-3.5 text-base font-semibold text-on disabled:opacity-50"
      >
        {initial ? 'Save changes' : 'Add subscription'}
        {preview ? ` · ≈ ${preview}` : ''}
      </button>

      {cancelled ? (
        <button onClick={() => setCancelledOn(null)} className="min-h-11 w-full text-center text-base font-semibold text-ac2-deep">
          Resume this subscription
        </button>
      ) : (
        <button
          onClick={() => setCancelledOn(todayIso || todayISO())}
          className="min-h-11 w-full text-center text-base font-semibold text-warn"
        >
          Mark cancelled
        </button>
      )}
      <p className="-mt-1 text-center text-[13px] text-tx3">
        Cancelling stops the prediction and keeps every charge it already made. Save to confirm.
      </p>
      {initial && onDelete && (
        <button
          onClick={() => onDelete(initial)}
          className="min-h-11 w-full text-center text-[14px] font-semibold text-tx3"
        >
          Delete instead — forget it ever existed
        </button>
      )}
    </Sheet>
  )
}
