'use client'
import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { CategoryPicker } from './CategoryPicker'
import { useMoney } from '@/lib/trips/Money'
import { toBase } from '@/lib/trips/format'
import { addDays, everydaySwitchable } from '@/lib/trips/spending'
import {
  categoriesFor, isEverydayCategory,
  categoryLabel, mostUsedCategories, suggestCategory, DEFAULT_CATEGORY, RECURRING_CATEGORY, type CategoryKind,
} from '@/lib/trips/categories'
import { nearestCharge, nextCharge, shortDate, subFromEntry, subNamed } from '@/lib/trips/subscriptions'
import type { LedgerEntry, Subscription } from '@/lib/trips/types'

// Add / edit an entry (round-two design, 2026-09-13). Name first — it is what
// the ledger shows, so it is labelled as such instead of hiding as "Note" at
// the bottom. The category is suggested from the name (alias table), shown as
// a pre-selected chip; six most-used chips + "All N…" opens the picker. No
// pick = Other. Amount and currency share one 52px row.
//
// In the Subscriptions category it asks one question (mock 16 §7, round 3):
// does it repeat? The charge IS the subscription (#59), so saving declares it,
// anchored on this entry's date, and no second form is ever needed.
// - A new name: Every month (preselected on a new entry), Every year, Other…
//   (every N months) or Doesn't repeat, the next charge, and a reminder three
//   days before, on by default.
// - A name that is already a live subscription: "Is this its 14 Oct charge?",
//   one tap to confirm, so a second charge never makes a second subscription.
//   The tap fills an empty amount and an untouched currency from it.
//   Unconfirmed, it is a plain entry.
// - An entry that is a charge already: the same block, set as the subscription
//   is, so a cadence can be corrected where the charge is.
// An entry typed before round 3 opens with nothing preselected: opening one to
// fix its amount must not declare anything.
//
// "Counts in the daily average" (#36, Patrik, 26 Sep): the category decides,
// and the form asks only when it matters, so a quick coffee stays one tap
// shorter. It asks for an amount at least 3× the daily pace (the 90 000 Ft
// concert ticket in Activities), for gear, insurance & visas and fees, which
// are out by default, and wherever the entry already says otherwise. Never for
// stays, transport or subscriptions: the projection adds those on its own.

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

/** What saving an entry does to the subscriptions beside it. */
export type SubChange =
  | { kind: 'create'; sub: Subscription }
  | { kind: 'update'; id: string; everyMonths: number; remind: boolean }
type Repeat = '1' | '12' | 'other' | 'no'
const REPEATS: { id: Repeat; label: string }[] = [
  { id: '1', label: 'Every month' },
  { id: '12', label: 'Every year' },
  { id: 'other', label: 'Other…' },
  { id: 'no', label: 'Doesn’t repeat' },
]

export function EntrySheet({
  initial, ledger, rates, defaultCur, defaultCurWhere, onSave, onDelete, onClose, note, subs = [], pace,
}: {
  initial: LedgerEntry | null
  ledger: LedgerEntry[]
  rates: Record<string, number>
  /** the journey's subscriptions, for the Subscriptions question */
  subs?: Subscription[]
  /** what the currency box starts on for a NEW entry (see pickEntryCurrency) */
  defaultCur: string
  /** the country that chose it, when the choice came from today's stop */
  defaultCurWhere?: string | null
  /** replaceId: the charge the app wrote that this entry replaces */
  onSave: (e: LedgerEntry, sub?: SubChange, replaceId?: string) => void
  onDelete?: (e: LedgerEntry) => void
  onClose: () => void
  /** one line right above the save button, for what saving does beyond saving */
  note?: string
  /** the daily pace without this entry, in base currency: what "big" is measured against */
  pace?: number | null
}) {
  const { base, fmt } = useMoney()
  // A booking's row follows the Trip page. A subscription charge the app wrote
  // is the ledger's own from then on: its amount and date can be corrected.
  const imported = !!initial?.source && initial.source.kind !== 'sub'
  const [type, setType] = useState<CategoryKind>(initial?.type ?? 'expense')
  const [name, setName] = useState(initial?.note ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [cur, setCur] = useState(initial?.currency ?? defaultCur)
  const [curTouched, setCurTouched] = useState(false)
  const [cat, setCat] = useState<string | null>(initial?.category ?? null)
  const [catTouched, setCatTouched] = useState(!!initial)
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [picker, setPicker] = useState(false)
  const [why, setWhy] = useState(false)
  // Unset: the category decides (#36). Set only by the switch.
  const [everyday, setEveryday] = useState<boolean | undefined>(initial?.everyday)

  // The Subscriptions question (see the header).
  const linked = initial?.subId ? subs.find((x) => x.id === initial.subId) ?? null : null
  const [repeat, setRepeat] = useState<Repeat | null>(() =>
    linked ? (linked.everyMonths === 1 ? '1' : linked.everyMonths === 12 ? '12' : 'other')
      : initial?.subId === null ? 'no'
        : initial ? null : '1')
  const [otherMonths, setOtherMonths] = useState(() => (linked && ![1, 12].includes(linked.everyMonths) ? String(linked.everyMonths) : '3'))
  const [remind, setRemind] = useState(linked ? !!linked.remind : true)
  const [isCharge, setIsCharge] = useState<boolean | null>(initial?.subId === null ? false : null)

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

  // The daily-average switch (see the header).
  const catId = effective ?? DEFAULT_CATEGORY[type]
  const byCategory = isEverydayCategory(catId)
  const counts = everyday ?? byCategory
  const times = pace && pace > 0 && valid ? toBase(amt, cur, rates) / pace : 0
  const askEveryday = type === 'expense' && !imported && everydaySwitchable(catId)
    && (everyday !== undefined || !byCategory || times >= 3)
  const everydayHint = !byCategory
    ? (counts ? 'Counted in the per-day rate, like everyday spending.' : `${categoryLabel(catId)} is left out by default: a cost of the whole trip, not of a day.`)
    : !counts ? 'Left out of the per-day rate. It still counts as spent.'
      : times >= 3 ? `About ${Math.round(times)}× a usual day. Switch it off for a one-time cost, like a ticket for a show. It still counts as spent.`
        : 'Counted in the per-day rate.'
  // Say WHY the box opened on this currency, but only while it is still the
  // app's guess: once it has been changed by hand the note would be a lie.
  const curNote =
    !initial && !curTouched && defaultCurWhere && cur === defaultCur
      ? `${cur} is the currency in ${defaultCurWhere}, where you are today.`
      : null

  const isSubCat = type === 'expense' && effective === RECURRING_CATEGORY && !imported
  const match = isSubCat && !linked ? subNamed(subs, name) : null
  const mode: 'linked' | 'match' | 'new' | null = !isSubCat ? null : linked ? 'linked' : match ? 'match' : 'new'
  const other = Math.round(Number(otherMonths))
  const otherOk = other >= 2 && other <= 24
  const months = repeat === '1' ? 1 : repeat === '12' ? 12 : repeat === 'other' && otherOk ? other : null
  const tomorrow = addDays(todayISO(), 1)
  const next = months && (mode === 'new' || mode === 'linked')
    ? nextCharge(
      mode === 'linked' ? { ...linked!, everyMonths: months } : { id: 'draft', label: '', cur, amount: 0, everyMonths: months, anchor: date },
      mode === 'linked' || addDays(date, 1) < tomorrow ? tomorrow : addDays(date, 1),
    )
    : null
  const matchCharge = match ? nearestCharge(match, date) : null
  // The row the app already wrote for that charge, if it has.
  const written = match
    ? ledger.find((e) => e.source?.kind === 'sub' && e.subId === match.id && e.id !== initial?.id
      && Math.abs(Date.parse(e.date) - Date.parse(date)) <= 15 * 86_400_000)
    : undefined
  const badOther = repeat === 'other' && !otherOk && (mode === 'new' || mode === 'linked')
  const dated = (iso: string) => (iso.slice(0, 4) === todayISO().slice(0, 4) ? shortDate(iso) : `${shortDate(iso)} ${iso.slice(0, 4)}`)

  function switchType(t: CategoryKind) {
    setType(t)
    setCat(null)
    setCatTouched(false)
  }
  function submit() {
    if (!valid || badOther) return
    const entry: LedgerEntry = {
      id: initial?.id ?? newId('le'),
      date: date || todayISO(),
      type,
      category: effective ?? DEFAULT_CATEGORY[type],
      amount: amt,
      currency: cur || base,
      note: name.trim(),
      ...(initial?.source ? { source: initial.source } : {}),
      ...(initial?.orphaned ? { orphaned: initial.orphaned } : {}),
      // Stored only where it differs from the category, so a later change of
      // category still brings that category's default with it.
      ...(askEveryday && everyday !== undefined && everyday !== byCategory ? { everyday } : {}),
    }
    // Out of the Subscriptions category, a charge is no longer one: no subId.
    let change: SubChange | undefined
    if (mode === 'new' && repeat === 'no') entry.subId = null
    else if (mode === 'new' && months) {
      const sub = subFromEntry({ label: entry.note, amount: amt, cur: entry.currency, date: entry.date }, months, remind, 'sub' + crypto.randomUUID())
      change = { kind: 'create', sub }
      entry.subId = sub.id
    } else if (mode === 'linked' && repeat === 'no') entry.subId = null
    else if (mode === 'linked' && months) {
      change = { kind: 'update', id: linked!.id, everyMonths: months, remind }
      entry.subId = linked!.id
    } else if (mode === 'match' && isCharge !== null) entry.subId = isCharge ? match!.id : null
    else if (mode && initial?.subId !== undefined) entry.subId = initial.subId
    onSave(entry, change, mode === 'match' && isCharge === true && written ? written.id : undefined)
  }

  return (
    <Sheet label={initial ? 'Edit entry' : 'Add entry'} onClose={onClose}>
      <h3 className="text-[20px] font-semibold">{initial ? 'Edit entry' : 'Add entry'}</h3>

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
        {/* No autoFocus: on the iPhone a keyboard that opens the instant the sheet
            appears shifts the sheet before it has settled and leaves a blank band
            under it (Petra, 23 Sep). A tap on a field opens it cleanly. */}
        <input
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
          <select
            aria-label="Currency"
            className={box}
            disabled={imported}
            value={cur}
            onChange={(e) => { setCur(e.target.value); setCurTouched(true) }}
          >
            {!currencies.includes(cur) && <option value={cur}>{cur}</option>}
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      {imported && (
        <p className="-mt-1 text-[13px] text-tx2">Amount and date follow the booking on the Trip page; edit them there.</p>
      )}
      {(curNote || preview) && (
        <p className="-mt-1 flex items-baseline justify-between gap-3 text-[13px] text-tx3">
          <span>{curNote}</span>
          {preview && <span className="shrink-0 tabular-nums">≈ {preview} in {base}</span>}
        </p>
      )}

      <div>
        <div className="flex items-baseline justify-between">
          <span className={label}>Category</span>
          {/* Behind an ⓘ, not always on (Petra, mock 16 round 2: too much text). */}
          {!catTouched && suggested && (
            <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} aria-label="Why this category" className="-my-3 -mr-3 flex size-11 items-center justify-center text-tx3">
              <Info aria-hidden className="size-[18px]" />
            </button>
          )}
          {!effective && name.trim().length >= 3 && <span className="text-[13px] text-tx3">none picked → Other</span>}
        </div>
        {why && !catTouched && suggested && <p className="mt-1 text-[13px] text-tx3">Suggested from the name. Tap another to change it.</p>}
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

      {mode === 'match' && match && (
        <div>
          <span className={label}>Repeats</span>
          <p className="mt-1 text-base">
            {match.label} is one of your subscriptions. Is this {matchCharge ? `its ${dated(matchCharge)} charge` : 'a charge of it'}?
          </p>
          <div className="mt-2 flex flex-wrap gap-[7px]" role="radiogroup" aria-label="Is this its charge">
            {/* Yes also fills what is still empty from the subscription: in
                Bangkok the currency box starts on THB, a bill from home is HUF. */}
            <button
              type="button"
              role="radio"
              aria-checked={isCharge === true}
              onClick={() => {
                setIsCharge(true)
                if (!amount) setAmount(String(match.amount))
                if (!curTouched) { setCur(match.cur); setCurTouched(true) }
              }}
              className={chip(isCharge === true)}
            >
              Yes, it is
            </button>
            <button type="button" role="radio" aria-checked={isCharge === false} onClick={() => setIsCharge(false)} className={chip(isCharge === false)}>No</button>
          </div>
          {isCharge === true && written && (
            <p className="mt-2 text-[14px] text-tx2">It was added by itself on {dated(written.date)}. Saving this replaces it.</p>
          )}
        </div>
      )}
      {(mode === 'new' || mode === 'linked') && (
        <div>
          <span className={label}>Repeats</span>
          <div className="mt-2 flex flex-wrap gap-[7px]" role="radiogroup" aria-label="Repeats">
            {REPEATS.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={repeat === r.id} onClick={() => setRepeat(r.id)} className={chip(repeat === r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          {repeat === 'other' && (
            <label className="mt-2.5 flex items-center gap-2 text-base text-tx2">
              every
              <input
                aria-label="Every how many months"
                type="number"
                inputMode="numeric"
                min={2}
                max={24}
                className={box + ' mt-0 w-[76px] text-center'}
                value={otherMonths}
                onChange={(e) => setOtherMonths(e.target.value)}
              />
              months
            </label>
          )}
          {repeat === 'other' && !otherOk && <p className="mt-1 text-[13px] text-warn">From 2 to 24 months.</p>}
          {next && <p className="mt-2 text-[14px] text-tx2">Next charge {dated(next)}.</p>}
          {months && (
            <div className="mt-2.5 flex min-h-11 items-center justify-between gap-3">
              <span className="text-base">Remind me before each charge<span className="block text-[13px] text-tx3">3 days before</span></span>
              <button
                type="button"
                role="switch"
                aria-checked={remind}
                aria-label="Remind me before each charge"
                onClick={() => setRemind(!remind)}
                className={'relative h-[31px] w-[52px] flex-none rounded-full transition-colors duration-[180ms] ' + (remind ? 'bg-ac' : 'bg-ln3')}
              >
                <span className={'absolute top-[3px] block h-[25px] w-[25px] rounded-full bg-sf transition-[left] duration-[180ms] ' + (remind ? 'left-[24px]' : 'left-[3px]')} />
              </button>
            </div>
          )}
        </div>
      )}

      {askEveryday && (
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-base">
            Counts in the daily average
            <span className="block text-[13px] text-tx3">{everydayHint}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={counts}
            aria-label="Counts in the daily average"
            onClick={() => setEveryday(!counts)}
            className={'relative h-[31px] w-[52px] flex-none rounded-full transition-colors duration-[180ms] ' + (counts ? 'bg-ac' : 'bg-ln3')}
          >
            <span className={'absolute top-[3px] block h-[25px] w-[25px] rounded-full bg-sf transition-[left] duration-[180ms] ' + (counts ? 'left-[24px]' : 'left-[3px]')} />
          </button>
        </div>
      )}

      {/* A field, not a grey "change" link. Logging yesterday's dinner this
          morning is the normal case on the road, and the date it defaults to
          has to be readable before anyone can notice it is wrong. */}
      <label className={label}>
        Date
        <input
          aria-label="Date"
          type="date"
          disabled={imported}
          className={box}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <span className="mt-1 block text-[13px] font-normal text-tx3">{dayLabel(date)}</span>
      </label>

      {note && <p className="-mb-1 text-center text-[13px] text-tx2">{note}</p>}
      <button
        onClick={submit}
        disabled={!valid || badOther}
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
