'use client'
import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { SheetBar, Toggle, chipCls, useCancel, useDirty } from '@/components/trips/sheetKit'
import { CategoryPicker } from './CategoryPicker'
import { CategoryTile, categoryColor } from './CategoryTile'
import { useMoney } from '@/lib/trips/Money'
import { parseAmount, toBase } from '@/lib/trips/format'
import { addDays, everydaySwitchable } from '@/lib/trips/spending'
import {
  categoriesFor, isEverydayCategory,
  categoryLabel, mostUsedCategories, suggestCategory, DEFAULT_CATEGORY, RECURRING_CATEGORY, type CategoryKind,
} from '@/lib/trips/categories'
import { nearestCharge, nextCharge, shortDate, subFromEntry, subNamed } from '@/lib/trips/subscriptions'
import type { LedgerEntry, Subscription } from '@/lib/trips/types'

// Add / edit an entry, since round 4c in the phone's look (EntrySheet.swift,
// Money mock round 2 §4): the amount large at the top with the currency as a
// small menu beside it and the conversion under it, the name on its own card,
// the four categories you use most as tiles with "All N categories" under
// them, then the date and the daily-average switch on one card. Cancel and
// Add / Save in the bar, as on every form since round 3c; "Discard changes?"
// on the way out. Patrik, 26 Sep: amount first, since what it cost is what
// you came to type; the title is the type, "Add expense ⌄", and a tap makes it
// "Add income ⌄" (about 98% of entries are expenses). The category is
// suggested from the name (alias table) until a tile is tapped. No pick =
// Other, the tile that starts selected.
//
// In the Subscriptions category it asks one question (mock 16 §7, round 3;
// Patrik, 24 Sep, #37): does it repeat? The charge IS the subscription (#59),
// so saving declares it, anchored on this entry's date, and no second form is
// ever needed. The phone has no such block (it points to the Subscriptions
// page instead); the web keeps the decided behaviour, on a card of its own.
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
// The daily-average switch (#36, Patrik, 26 Sep): the category decides unless
// the entry says otherwise. It is on every expense typed by hand, never for
// stays, transport or subscriptions: the projection adds those on its own, so
// counting them in the pace too would count twice. Since round 4c it reads as
// the phone's: "In the daily average", on when the entry counts, so the
// switch shows the state rather than naming the exception. Stored only where
// it differs from the category.

const newId = (p: string) => p + crypto.randomUUID()
const todayISO = () => new Date().toISOString().slice(0, 10)
const dayLabel = (iso: string) =>
  iso === todayISO() ? 'Today' : new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
/** A white card on the sheet's canvas, the phone's `group`. */
const group = 'rounded-[16px] bg-sf px-[14px]'
const row = 'flex min-h-[50px] items-center justify-between gap-3 py-1 text-base text-tx'
const small = 'block text-[14px] font-medium text-tx2'

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
  initial, ledger, rates, defaultCur, defaultCurWhere, onSave, onDelete, onClose, note, subs = [],
}: {
  initial: LedgerEntry | null
  ledger: LedgerEntry[]
  rates: Record<string, number>
  /** the journey's subscriptions, for the Subscriptions question */
  subs?: Subscription[]
  /** what the currency starts on for a NEW entry (see pickEntryCurrency) */
  defaultCur: string
  /** the country that chose it, when the choice came from today's stop */
  defaultCurWhere?: string | null
  /** replaceId: the charge the app wrote that this entry replaces */
  onSave: (e: LedgerEntry, sub?: SubChange, replaceId?: string) => void
  onDelete?: (e: LedgerEntry) => void
  onClose: () => void
  /** one line under the form, for what saving does beyond saving */
  note?: string
}) {
  const { base, fmt } = useMoney()
  // A booking's row follows the Trip page. A subscription charge the app wrote
  // is the ledger's own from then on: its amount and date can be corrected. A
  // paid one-off's row from before #39 is a plain entry (importCosts.ts).
  const imported = !!initial?.source && initial.source.kind !== 'sub' && initial.source.kind !== 'extra'
  const [type, setType] = useState<CategoryKind>(initial?.type ?? 'expense')
  const [name, setName] = useState(initial?.note ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [cur, setCur] = useState(initial?.currency ?? defaultCur)
  const [curTouched, setCurTouched] = useState(false)
  const [cat, setCat] = useState<string | null>(initial?.category ?? null)
  const [catTouched, setCatTouched] = useState(!!initial)
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [picker, setPicker] = useState(false)
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

  const dirty = useDirty({ type, name, amount, cur, cat, date, everyday, repeat, otherMonths, remind, isCharge })
  const cancel = useCancel(dirty, onClose)

  // The suggestion follows the name until a tile is tapped.
  const suggested = useMemo(() => suggestCategory(name, type), [name, type])
  const effective = catTouched ? cat : suggested
  // The selected tile: the pick, the suggestion, or Other (the phone starts on it).
  const catId = effective ?? DEFAULT_CATEGORY[type]
  const tiles = useMemo(() => {
    const row = mostUsedCategories(ledger, type, 4)
    if (!row.includes(catId)) row.unshift(catId)
    return row.slice(0, 4)
  }, [ledger, type, catId])
  // The base first, as on the phone; one that is no longer watched stays listed while it is picked.
  const currencies = useMemo(() => {
    const list = Object.keys(rates).filter((c) => c !== base).sort()
    list.unshift(base)
    if (cur && !list.includes(cur)) list.push(cur)
    return list
  }, [rates, base, cur])
  const amt = parseAmount(amount)
  const valid = isFinite(amt) && amt > 0

  // The daily-average switch (see the header).
  const byCategory = isEverydayCategory(catId)
  const counts = everyday ?? byCategory
  const askEveryday = type === 'expense' && !imported && everydaySwitchable(catId)
  // The conversion, and why the currency is this one while it is still the
  // app's guess: once changed by hand the note would be a lie.
  const conversion: string[] = []
  if (valid && cur !== base) conversion.push(`≈ ${fmt(toBase(amt, cur, rates))}`)
  if (!initial && !curTouched && defaultCurWhere && cur === defaultCur && cur !== base) conversion.push(`you’re in ${defaultCurWhere}`)

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
  const footnote = imported
    ? 'Amount and date follow the booking on the Trip page; edit them there.'
    : note
  const shortLabel = (id: string) => (id === 'convenience' ? 'Convenience' : categoryLabel(id))

  function switchType(t: CategoryKind) {
    setType(t)
    setCat(null)
    setCatTouched(false)
    setEveryday(undefined)
  }
  function submit() {
    if (!valid || badOther) return
    const entry: LedgerEntry = {
      id: initial?.id ?? newId('le'),
      date: date || todayISO(),
      type,
      category: catId,
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

  const typeWord = type === 'expense' ? 'expense' : 'income'
  const title = initial || imported
    ? (type === 'expense' ? 'Expense' : 'Income')
    : (
      <button
        type="button"
        onClick={() => switchType(type === 'expense' ? 'income' : 'expense')}
        aria-label={`Add ${typeWord}. Switch to ${type === 'expense' ? 'income' : 'expense'}`}
        className="inline-flex min-h-11 items-center gap-1 text-base font-semibold text-tx"
      >
        Add {typeWord}
        <ChevronDown aria-hidden className="size-[11px] text-tx" strokeWidth={3} />
      </button>
    )

  return (
    <Sheet label={initial ? `Edit ${typeWord}` : `Add ${typeWord}`} onClose={cancel} surface="canvas">
      <SheetBar title={title} onCancel={cancel} onSave={submit} saveLabel={initial ? 'Save' : 'Add'} canSave={valid && !badOther} />

      {/* The amount, large, with the currency beside it. The input is as wide as
          what is typed (the hidden twin under it sizes the cell), so the
          currency sits right after the number, as on the phone. No autoFocus:
          on the iPhone a keyboard that opens the instant the sheet appears
          shifts the sheet before it has settled (Petra, 23 Sep). */}
      <div className="flex flex-col items-center gap-1 pt-1">
        <div className="flex max-w-full items-baseline justify-center gap-2.5">
          <span className="inline-grid min-w-0 max-w-[70%]">
            <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre px-1 text-[46px] font-semibold leading-none">{amount || '0'}</span>
            <input
              aria-label="Amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              disabled={imported}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              // The size inline, not as a class: globals.css forces every input to 16px on
              // phone-sized screens so iOS never zooms on focus, and that rule beats a
              // class (Petra, 14 Oct: the number small beside its currency).
              style={{ fontSize: 46, lineHeight: 1 }}
              className="col-start-1 row-start-1 w-full min-w-[2ch] bg-transparent px-1 text-center font-semibold text-tx outline-none placeholder:text-tx3 disabled:opacity-60"
            />
          </span>
          <span className="relative flex-none">
            <select
              aria-label="Currency"
              disabled={imported}
              value={cur}
              onChange={(e) => { setCur(e.target.value); setCurTouched(true) }}
              className="appearance-none rounded-[9px] bg-fill py-1.5 pl-2.5 pr-[26px] text-[15px] font-semibold text-tx outline-none disabled:opacity-60"
            >
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 size-[10px] -translate-y-1/2 text-tx" strokeWidth={3} />
          </span>
        </div>
        <p className="min-h-[18px] text-center text-[13px] tabular-nums text-tx2">{conversion.join(' · ')}</p>
      </div>

      <div className={group}>
        <input
          aria-label="What was it?"
          className="w-full bg-transparent py-[13px] text-base text-tx outline-none placeholder:text-tx3"
          placeholder="What was it? · optional"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* The four categories you use most, as tiles; the picked one first when it is not among them. */}
      <div className="flex flex-col items-center gap-2.5 rounded-[16px] bg-sf p-3">
        <div className="flex w-full items-start gap-1" role="group" aria-label="Category">
          {tiles.map((id) => {
            const on = id === catId
            return (
              <button
                key={id}
                type="button"
                disabled={imported}
                onClick={() => { setCat(id); setCatTouched(true) }}
                aria-pressed={on}
                aria-label={categoryLabel(id)}
                className="flex min-w-0 flex-1 flex-col items-center gap-1.5 disabled:opacity-60"
              >
                <span className="rounded-[16px] p-[3px]" style={on ? { boxShadow: `inset 0 0 0 2px ${categoryColor(id)}` } : undefined}>
                  <CategoryTile id={id} size={46} />
                </span>
                <span className={'line-clamp-2 text-center text-[11.5px] leading-tight ' + (on ? 'font-semibold text-tx' : 'text-tx2')}>{shortLabel(id)}</span>
              </button>
            )
          })}
        </div>
        <button type="button" disabled={imported} onClick={() => setPicker(true)} className="min-h-9 text-[14px] font-medium text-ac disabled:opacity-60">
          All {categoriesFor(type).length} categories
        </button>
      </div>

      {mode === 'match' && match && (
        <div className={group + ' py-3'}>
          <span className={small}>Repeats</span>
          <p className="mt-1 text-base text-tx">
            {match.label} is one of your subscriptions. Is this {matchCharge ? `its ${dated(matchCharge)} charge` : 'a charge of it'}?
          </p>
          <div className="mt-2.5 flex flex-wrap gap-[7px]" role="radiogroup" aria-label="Is this its charge">
            {/* Yes also fills what is still empty from the subscription: in
                Bangkok the currency starts on THB, a bill from home is HUF. */}
            <button
              type="button"
              role="radio"
              aria-checked={isCharge === true}
              onClick={() => {
                setIsCharge(true)
                if (!amount) setAmount(String(match.amount))
                if (!curTouched) { setCur(match.cur); setCurTouched(true) }
              }}
              className={chipCls(isCharge === true)}
            >
              Yes, it is
            </button>
            <button type="button" role="radio" aria-checked={isCharge === false} onClick={() => setIsCharge(false)} className={chipCls(isCharge === false)}>No</button>
          </div>
          {isCharge === true && written && (
            <p className="mt-2.5 text-[14px] text-tx2">It was added by itself on {dated(written.date)}. Saving this replaces it.</p>
          )}
        </div>
      )}
      {(mode === 'new' || mode === 'linked') && (
        <div className={group + ' py-3'}>
          <span className={small}>Repeats</span>
          <div className="mt-2.5 flex flex-wrap gap-[7px]" role="radiogroup" aria-label="Repeats">
            {REPEATS.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={repeat === r.id} onClick={() => setRepeat(r.id)} className={chipCls(repeat === r.id)}>
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
                className="w-[76px] rounded-[9px] bg-fill px-2 py-1.5 text-center text-base font-medium text-tx outline-none"
                value={otherMonths}
                onChange={(e) => setOtherMonths(e.target.value)}
              />
              months
            </label>
          )}
          {repeat === 'other' && !otherOk && <p className="mt-1 text-[13px] text-warn">From 2 to 24 months.</p>}
          {next && <p className="mt-2.5 text-[14px] text-tx2">Next charge {dated(next)}.</p>}
          {months && (
            <div className="mt-1 flex min-h-11 items-center justify-between gap-3">
              <span className="text-base text-tx">Remind me before each charge<span className="block text-[13px] text-tx2">3 days before</span></span>
              <Toggle on={remind} onChange={setRemind} label="Remind me before each charge" />
            </div>
          )}
        </div>
      )}

      {/* The date and the daily-average switch on one card (Patrik, 27 Sep). The
          native date input lies invisibly over the pill, so a tap opens the
          phone's own picker. */}
      <div className={group}>
        <div className={row}>
          <span>Date</span>
          <label className={'relative inline-flex min-h-9 flex-none items-center gap-1.5 rounded-[9px] bg-fill px-3 text-[15px] font-medium text-tx ' + (imported ? 'opacity-60' : '')}>
            <CalendarDays aria-hidden className="size-4 text-tx2" />
            <span>{dayLabel(date)}</span>
            <input
              aria-label="Date"
              type="date"
              disabled={imported}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onClick={(e) => { try { e.currentTarget.showPicker() } catch { /* the tap still focuses it */ } }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
            />
          </label>
        </div>
        {askEveryday && (
          <>
            <div className="border-t border-ln" />
            <div className={row}>
              <span>In the daily average</span>
              <Toggle on={counts} onChange={setEveryday} label="In the daily average" />
            </div>
          </>
        )}
      </div>

      {footnote && <p className="px-1 text-[13px] text-tx2">{footnote}</p>}
      {initial && onDelete && (
        <button type="button" onClick={() => onDelete(initial)} className="min-h-11 w-full text-center text-base font-medium text-ac2-deep">
          Delete entry
        </button>
      )}

      {picker && (
        <CategoryPicker
          kind={type}
          ledger={ledger}
          selected={catId}
          onPick={(id) => { setCat(id); setCatTouched(true); setPicker(false) }}
          onClose={() => setPicker(false)}
        />
      )}
    </Sheet>
  )
}
