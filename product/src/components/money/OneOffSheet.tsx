'use client'
import { useState } from 'react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { useMoney } from '@/lib/trips/Money'
import { toBase } from '@/lib/trips/format'
import type { Extra } from '@/lib/trips/types'

// Add / edit a one-off cost (round 3c): visas, insurance, gear, the costs of
// the whole trip. Until round 3c this form lived on an Extras screen under
// Trip, reached from Money's One-offs card and leaving Money for good: its
// back link said "← Trip". Now the card opens it in place, like an entry or a
// subscription, and the Extras screen is gone.
//
// What it saves is the same Extra as before (lib/trips/types.ts):
// - the category words stay the old form's own (Visa, Insurance, …), which
//   lib/trips/extras.ts maps onto the ledger's categories;
// - Paid writes the payment into All entries by itself (importCosts.ts), and
//   Not paid yet removes it again, so the two columns fill from one form;
// - Count it as planned is the old screen's tick: off for a cost nobody has
//   committed to, which then counts nowhere until it is paid.

const newId = () => 'ex' + crypto.randomUUID()
const todayISO = () => new Date().toISOString().slice(0, 10)
// The old form's words, in its order; lib/trips/extras.ts maps each one.
const CATS = ['Visa', 'Insurance', 'Vaccines', 'Gear', 'Flights (intl)', 'SIM/eSIM', 'Other']
const label = 'block min-w-0 text-[14px] font-medium text-tx2'
const box =
  'mt-1.5 flex min-h-[52px] w-full items-center rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 text-base text-tx outline-none transition-colors duration-[180ms] focus:border-ac'
const chip = (on: boolean) =>
  'rounded-full border-[1.5px] px-3 py-[7px] text-[14px] font-medium transition-colors duration-[180ms] ' +
  (on ? 'border-ac bg-ac text-on' : 'border-ln2 bg-sf text-tx')

export function OneOffSheet({ initial, rates, todayIso, onSave, onDelete, onClose }: {
  initial: Extra | null
  rates: Record<string, number>
  todayIso: string
  onSave: (x: Extra) => void
  onDelete?: (x: Extra) => void
  onClose: () => void
}) {
  const { base, fmt } = useMoney()
  const [name, setName] = useState(initial?.label ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [cur, setCur] = useState(initial?.cur ?? base)
  // "gear" saved by an older form is the Gear chip, not a second one beside it.
  const saved = initial?.category?.trim() ?? ''
  const [category, setCategory] = useState(CATS.find((c) => c.toLowerCase() === saved.toLowerCase()) ?? (saved || 'Other'))
  const [paid, setPaid] = useState(!!initial?.paidOn)
  const [paidOn, setPaidOn] = useState(initial?.paidOn || todayIso || todayISO())
  const [counted, setCounted] = useState(initial?.include !== false)

  const currencies = Object.keys(rates)
  // A word typed on the old free-text form stays choosable, so opening an
  // extra never changes its category by itself.
  const cats = CATS.includes(category) ? CATS : [...CATS, category]
  const amt = parseFloat(amount)
  const valid = !!name.trim() && isFinite(amt) && amt > 0 && (!paid || !!paidOn)
  const preview = isFinite(amt) && amt > 0 && cur !== base ? fmt(toBase(amt, cur, rates)) : null
  const ahead = paid && !!paidOn && paidOn > (todayIso || todayISO())

  function submit() {
    if (!valid) return
    onSave({
      id: initial?.id ?? newId(),
      label: name.trim(),
      category,
      cur: cur || base,
      amount: amt,
      include: counted,
      ...(paid ? { paidOn } : {}),
    })
  }

  return (
    <Sheet label={initial ? 'Edit one-off cost' : 'Add one-off cost'} onClose={onClose}>
      <h3 className="text-[20px] font-semibold">{initial ? 'Edit one-off cost' : 'Add one-off cost'}</h3>

      <label className={label}>
        What is it?
        <input
          autoFocus={!initial}
          className={box}
          placeholder="e.g. Travel insurance, Vietnam e-visa"
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
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
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

      <div>
        <div className={label}>Category</div>
        <div role="radiogroup" aria-label="Category" className="mt-1.5 flex flex-wrap gap-2">
          {cats.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)} className={chip(category === c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className={label}>Paid?</div>
        <div role="radiogroup" aria-label="Paid?" className="mt-1.5 flex flex-wrap gap-2">
          <button type="button" role="radio" aria-checked={!paid} onClick={() => setPaid(false)} className={chip(!paid)}>Not paid yet</button>
          <button type="button" role="radio" aria-checked={paid} onClick={() => setPaid(true)} className={chip(paid)}>Paid</button>
        </div>
        {paid ? (
          <>
            <label className={label + ' mt-2.5'}>
              Paid on
              <input type="date" aria-label="Paid on" className={box} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </label>
            <p className="mt-1.5 text-[13px] leading-snug text-tx2">
              {ahead
                ? 'Dated after today, so All entries shows it as scheduled until then.'
                : 'The payment goes into All entries by itself, on this date.'}
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-[13px] leading-snug text-tx2">
            {initial?.paidOn
              ? 'Saving this takes its payment out of All entries.'
              : 'It counts as planned. When you pay, choose Paid and the payment goes into All entries.'}
          </p>
        )}
      </div>

      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-base">
          Count it as planned
          <span className="block text-[13px] text-tx3">Off for a cost you haven’t committed to yet. Once paid, it counts as paid either way.</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={counted}
          aria-label="Count it as planned"
          onClick={() => setCounted(!counted)}
          className={'relative h-[31px] w-[52px] flex-none rounded-full transition-colors duration-[180ms] ' + (counted ? 'bg-ac' : 'bg-ln3')}
        >
          <span className={'absolute top-[3px] block h-[25px] w-[25px] rounded-full bg-sf transition-[left] duration-[180ms] ' + (counted ? 'left-[24px]' : 'left-[3px]')} />
        </button>
      </div>

      <button
        onClick={submit}
        disabled={!valid}
        className="w-full rounded-[var(--rCtl)] bg-ac py-3.5 text-base font-semibold text-on disabled:opacity-50"
      >
        {initial ? 'Save changes' : 'Add one-off cost'}
        {preview ? ` · ≈ ${preview}` : ''}
      </button>
      {initial && onDelete && (
        <button onClick={() => onDelete(initial)} className="min-h-11 w-full text-center text-base font-semibold text-tx3">
          Delete this one-off
        </button>
      )}
    </Sheet>
  )
}
