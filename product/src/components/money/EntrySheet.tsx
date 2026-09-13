'use client'
import { useMemo, useState } from 'react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { CategoryPicker } from './CategoryPicker'
import { useMoney } from '@/lib/trips/Money'
import { toBase } from '@/lib/trips/format'
import {
  categoriesFor,
  categoryLabel, mostUsedCategories, suggestCategory, DEFAULT_CATEGORY, type CategoryKind,
} from '@/lib/trips/categories'
import type { LedgerEntry } from '@/lib/trips/types'

// Add / edit an entry (round-two design, 2026-09-13). Name first — it is what
// the ledger shows, so it is labelled as such instead of hiding as "Note" at
// the bottom. The category is suggested from the name (alias table), shown as
// a pre-selected chip; six most-used chips + "All N…" opens the picker. No
// pick = Other. Amount and currency share one 52px row.

const newId = (p: string) => p + crypto.randomUUID()
const todayISO = () => new Date().toISOString().slice(0, 10)
const label = 'block min-w-0 text-[14px] font-medium text-tx2'
const box =
  'mt-1.5 flex min-h-[52px] w-full items-center rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 text-base text-tx outline-none transition-colors duration-[180ms] focus:border-ac disabled:opacity-60'
const chip = (on: boolean) =>
  'rounded-full border-[1.5px] px-3 py-[7px] text-[14px] font-medium transition-colors duration-[180ms] ' +
  (on ? 'border-ac bg-ac text-on' : 'border-ln2 bg-sf text-tx')
const dayLabel = (iso: string) =>
  iso === todayISO() ? 'Today' : new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export function EntrySheet({
  initial, ledger, rates, defaultCur, onSave, onDelete, onClose,
}: {
  initial: LedgerEntry | null
  ledger: LedgerEntry[]
  rates: Record<string, number>
  /** what the currency box starts on for a NEW entry (the last one used) */
  defaultCur: string
  onSave: (e: LedgerEntry) => void
  onDelete?: (e: LedgerEntry) => void
  onClose: () => void
}) {
  const { base, fmt } = useMoney()
  const imported = !!initial?.source
  const [type, setType] = useState<CategoryKind>(initial?.type ?? 'expense')
  const [name, setName] = useState(initial?.note ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [cur, setCur] = useState(initial?.currency ?? defaultCur)
  const [cat, setCat] = useState<string | null>(initial?.category ?? null)
  const [catTouched, setCatTouched] = useState(!!initial)
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [dateOpen, setDateOpen] = useState(false)
  const [picker, setPicker] = useState(false)

  // The suggestion follows the name until the user picks a chip themselves.
  const suggested = useMemo(() => suggestCategory(name, type), [name, type])
  const effective = catTouched ? cat : suggested
  const chips = useMemo(() => {
    const row = mostUsedCategories(ledger, type, 6)
    if (effective && !row.includes(effective)) row.unshift(effective)
    return row.slice(0, 6)
  }, [ledger, type, effective])
  const currencies = Object.keys(rates)
  const amt = parseFloat(amount)
  const valid = isFinite(amt) && amt > 0
  const preview = valid && cur !== base ? fmt(toBase(amt, cur, rates)) : null

  function switchType(t: CategoryKind) {
    setType(t)
    setCat(null)
    setCatTouched(false)
  }
  function submit() {
    if (!valid) return
    onSave({
      id: initial?.id ?? newId('le'),
      date: date || todayISO(),
      type,
      category: effective ?? DEFAULT_CATEGORY[type],
      amount: amt,
      currency: cur || base,
      note: name.trim(),
      ...(initial?.source ? { source: initial.source } : {}),
      ...(initial?.orphaned ? { orphaned: initial.orphaned } : {}),
    })
  }

  return (
    <Sheet label={initial ? 'Edit entry' : 'Add entry'} onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-[20px] font-semibold">{initial ? 'Edit entry' : 'Add entry'}</h3>
        <button onClick={onClose} aria-label="Close" className="-m-2 flex size-11 items-center justify-center text-tx3">✕</button>
      </div>

      <div className="flex rounded-[14px] border-[1.5px] border-ln2 bg-inp p-[3px]" role="radiogroup" aria-label="Type">
        {(['expense', 'income'] as const).map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={type === t}
            disabled={imported}
            onClick={() => switchType(t)}
            className={'flex-1 rounded-[11px] py-2 text-base font-semibold capitalize ' + (type === t ? 'bg-sf text-tx shadow-sm' : 'text-tx2')}
          >
            {t}
          </button>
        ))}
      </div>

      <label className={label}>
        What was it?
        <input
          autoFocus={!initial}
          className={box}
          placeholder={type === 'expense' ? 'e.g. Iced coffee, Grab to the airport' : 'e.g. September invoice'}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <span className="mt-1 block text-[13px] font-normal text-tx3">Shown as the entry’s name. Leave it empty and the category stands in.</span>
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
            disabled={imported}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className={label}>
          Currency
          <select aria-label="Currency" className={box} disabled={imported} value={cur} onChange={(e) => setCur(e.target.value)}>
            {!currencies.includes(cur) && <option value={cur}>{cur}</option>}
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      {imported && (
        <p className="-mt-1 text-[13px] text-tx2">Amount and date follow the booking on the Trip page; edit them there.</p>
      )}

      <div>
        <div className="flex items-baseline justify-between">
          <span className={label}>Category</span>
          {!catTouched && suggested && <span className="text-[13px] text-tx3">suggested from the name</span>}
          {!effective && name.trim().length >= 3 && <span className="text-[13px] text-tx3">none picked → Other</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-[7px]">
          {chips.map((id) => (
            <button key={id} onClick={() => { setCat(id); setCatTouched(true) }} className={chip(effective === id)} aria-pressed={effective === id}>
              {categoryLabel(id)}{effective === id && !catTouched ? ' ✓' : ''}
            </button>
          ))}
          <button onClick={() => setPicker(true)} className={chip(false) + ' border-dashed bg-inp text-tx2'}>
            All {categoriesFor(type).length}…
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-[14px] text-tx2">
        {dateOpen || imported ? (
          <input
            aria-label="Date"
            type="date"
            disabled={imported}
            className="rounded-[12px] border-[1.5px] border-ln2 bg-inp px-2 py-1.5 text-base text-tx outline-none focus:border-ac"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        ) : (
          <button onClick={() => setDateOpen(true)} className="-my-2 min-h-11 text-left">
            {dayLabel(date)}{date !== todayISO() ? '' : `, ${new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
            <span className="text-tx3"> · change</span>
          </button>
        )}
        <span className="text-tx3">{preview ? `≈ ${preview}` : ''}</span>
      </div>

      <button
        onClick={submit}
        disabled={!valid}
        className="w-full rounded-[var(--rCtl)] bg-ac py-3.5 text-base font-semibold text-on disabled:opacity-50"
      >
        {initial ? 'Save changes' : type === 'expense' ? 'Add expense' : 'Add income'}
      </button>
      {initial && onDelete && (
        <button onClick={() => onDelete(initial)} className="min-h-11 w-full text-center text-base font-semibold text-ac2-deep">
          Delete this entry
        </button>
      )}

      {picker && (
        <CategoryPicker
          kind={type}
          ledger={ledger}
          selected={effective}
          onPick={(id) => { setCat(id); setCatTouched(true); setPicker(false) }}
          onClose={() => setPicker(false)}
        />
      )}
    </Sheet>
  )
}
