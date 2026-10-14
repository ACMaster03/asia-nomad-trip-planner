'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, ChevronDown, ChevronLeft, CircleX, Pencil, Plus, RotateCcw, Search, Trash2, X, type LucideIcon } from 'lucide-react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripRole } from '@/lib/trips/useTripRole'
import { usePlanSync } from '@/lib/trips/usePlanSync'
import { useToday } from '@/lib/useToday'
import { categoryLabel, GROUPS } from '@/lib/trips/categories'
import { toBase } from '@/lib/trips/format'
import {
  daySections, daysToShow, dayTitle, FILTERS, focusFromParams, focusTitle, isFocused, matching, spentOf, splitRows, summaryLine, usedCategories,
  type EntriesParams, type Focus,
} from '@/lib/trips/ledgerFilters'
import { shortDate } from '@/lib/trips/subscriptions'
import { ownerOf } from '@/lib/trips/moneyRows'
import { useCameFrom } from '@/lib/useCameFrom'
import { SaveError } from '@/components/trips/SaveError'
import { ViewerNotice } from '@/components/trips/ViewerNotice'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { useLongPress } from '@/components/trips/useLongPress'
import type { LedgerEntry } from '@/lib/trips/types'
import { CategoryTile, categoryColor } from './CategoryTile'
import { EntryRow } from './EntryRow'
import { EntryEditor } from './EntryEditor'
import { ChargeNotice } from './ChargeNotice'
import { deleteEntry, entryLabel } from './deleteEntry'

// All entries, the ledger's own screen (Petra, 23 Sep; #38), since round 4b
// in the phone's look (LedgerScreen.swift): the search, a row of chips
// (Before departure, Category, then All / Everyday / Beyond the everyday /
// Bookings / Subscriptions / Income), one line of what the filtered rows come
// to, Coming up folded at the top, then the days with their totals, each day's
// rows on a card, the category tiles. The month bands and the "Trip starts"
// band went: the days carry "day 1", and Before departure is a chip.
//
// A tap on a row opens its form; a long press (a right click on a desktop)
// opens the row's menu: Log again (the same thing again, today), Edit, Delete,
// which is the phone's pair of swipes. The name is Petra's: Patrik wanted a
// plainer word than ledger. Adding is here too, as on the phone.
//
// The list starts at twenty rows and pages backwards by whole days (#38). This
// saves render cost, NOT bandwidth: the ledger is a jsonb column on the trip
// row, selected whole with the state, so every byte has arrived before this
// screen renders. Every total is computed over EVERY matching row; only the
// rendering is cut. A day the chart asked for is rendered however far down it
// sits, so it can be scrolled to.
//
// The search box is not autofocused: on a phone the keyboard would cover the
// list it is there to shorten (CategoryPicker, 13 Sep). Its clear button is
// ours: Safari shows its own only while typing, and Chrome draws it blue.

const PAGE = 20
const NONE: LedgerEntry[] = []
const NO_RATES: Record<string, number> = {}

export default function LedgerPage({ params = {} }: { params?: EntriesParams }) {
  const { fmt, base } = useMoney()
  const { trip } = useTripScreen()
  const mut = useLedgerMutation()
  const stateMut = useTripMutation()
  const { canEdit } = useTripRole()
  const today = useToday()
  const confirm = useConfirm()
  const toast = useToast()
  const router = useRouter()
  const cameFrom = useCameFrom('/money/entries')
  const tripStart = trip.data?.state.meta.startDate || undefined
  const initial = useMemo(() => focusFromParams(params, tripStart), [params, tripStart])
  // What the chips and the search hold; until something is tapped, what the link asked for.
  const [picked, setPicked] = useState<Focus | null>(null)
  const focus = picked ?? initial.focus
  const setFocus = (patch: Partial<Focus>) => setPicked({ ...focus, ...patch })
  const [comingOpen, setComingOpen] = useState(() => initial.coming)
  const [catMenu, setCatMenu] = useState(false)
  const [sheet, setSheet] = useState<{ entry: LedgerEntry | null } | null>(null)
  const [menu, setMenu] = useState<LedgerEntry | null>(null)
  const [pages, setPages] = useState(1)
  const chips = useRef<HTMLDivElement>(null)
  const ledger = trip.data?.ledger ?? NONE
  const rates = trip.data?.state.rates ?? NO_RATES
  const state = trip.data?.state
  // A day between stops: on the journey, and no stop's (a travel day is the next stop's).
  const rows = useMemo(
    () => matching(ledger, focus, (d) => !!state && !!tripStart && d >= tripStart && !ownerOf(state, d)),
    [ledger, focus, state, tripStart],
  )
  const { past, coming } = useMemo(() => splitRows(rows, ledger, today ?? ''), [rows, ledger, today])
  const days = useMemo(() => daySections(past, rates), [past, rates])
  const used = useMemo(() => usedCategories(ledger), [ledger])
  usePlanSync(trip.data, canEdit, mut)
  const ready = !!trip.data && !!today
  // The day the chart asked for, once the rows are there to scroll to.
  useEffect(() => {
    if (!ready || !initial.day) return
    document.getElementById(`day-${initial.day}`)?.scrollIntoView({ block: 'start' })
  }, [ready, initial.day])

  if (trip.isPending || (trip.data && !today)) {
    return <main className="mx-auto max-w-xl p-6 text-base text-tx2">Loading…</main>
  }
  if (!trip.data || !today) return <CreateTripEmptyState />
  const started = !!tripStart && tripStart <= today
  const shownDays = days.slice(0, daysToShow(days, pages * PAGE, initial.day))
  const shownRows = shownDays.reduce((a, d) => a + d.entries.length, 0)
  const comingTotal = spentOf(coming, rates)
  const query = focus.query.trim()

  /** The same thing again, today: the second iced coffee of the week. */
  function logAgain(e: LedgerEntry) {
    const copy: LedgerEntry = { id: 'le' + crypto.randomUUID(), date: today!, type: e.type, category: e.category, amount: e.amount, currency: e.currency, note: e.note }
    if (e.everyday !== undefined) copy.everyday = e.everyday
    mut.mutate({ kind: 'upsert', entry: copy })
    toast(`Logged again · ${fmt(toBase(e.amount, e.currency, rates))} · ${entryLabel(e)}`)
    setMenu(null)
  }
  async function remove(e: LedgerEntry) {
    setMenu(null)
    await deleteEntry(e, { confirm, mut, stateMut, toast })
  }

  const chip = (on: boolean) =>
    'flex h-[34px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] ' +
    (on ? 'border-ac-line bg-ac-soft font-semibold text-ac' : 'border-transparent bg-fill text-tx2')
  const swatch = (color: string) => <span aria-hidden className="size-[9px] flex-none rounded-[3px]" style={{ background: color }} />
  const spanText = focus.span ? `${shortDate(focus.span.from)} – ${shortDate(focus.span.to)}` : ''

  const comingRow = (e: LedgerEntry) => (
    <button key={e.id} type="button" disabled={!canEdit} onClick={() => setSheet({ entry: e })} className="flex w-full items-center gap-2.5 text-left">
      <span className="w-[46px] flex-none text-[12.5px] font-medium text-tx3">{shortDate(e.date)}</span>
      {/* The row takes what is left beside the date, so the amount stays inside the box (Petra, 14 Oct). */}
      <span className="flex min-w-0 flex-1"><EntryRow entry={e} rates={rates} base={base} fmt={fmt} todayIso={today!} /></span>
    </button>
  )

  return (
    <main className="mx-auto grid w-full max-w-xl grid-cols-1 items-start gap-3 px-4 pb-6 pt-[10px] text-tx">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/money"
            // Back when Money is the screen before this one: the browser restores it at once (lib/useCameFrom.ts).
            onClick={(e) => { if (cameFrom.current === '/money') { e.preventDefault(); router.back() } }}
            className="-ml-1.5 inline-flex min-h-11 items-center text-base font-semibold text-ac2-deep"
          >
            <ChevronLeft aria-hidden className="size-5" />Money
          </Link>
          <h1 className="truncate font-serif text-[25px] font-semibold leading-[1.15] tracking-[-.01em]">{focusTitle(focus)}</h1>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setSheet({ entry: null })}
            aria-label="Add an entry"
            title="Add an entry"
            className="mb-1 flex size-[42px] flex-none items-center justify-center rounded-full border border-ln bg-sf text-ac2"
          >
            <Plus aria-hidden className="size-[18px]" strokeWidth={2.6} />
          </button>
        )}
      </div>
      <ViewerNotice />
      <div className="empty:hidden">
        <SaveError show={mut.isError} error={mut.error} />
        <SaveError show={stateMut.isError} error={stateMut.error} />
      </div>
      {ledger.length > 0 && (
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-tx3" />
          <input
            type="search"
            enterKeyHint="search"
            aria-label="Search entries"
            placeholder="Name or category"
            value={focus.query}
            onChange={(e) => setFocus({ query: e.target.value })}
            // Search on the phone's keyboard puts it away, so the matches are
            // not left behind it.
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className="w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-sf py-3 pl-10 pr-11 text-base text-tx outline-none focus:border-ac [&::-webkit-search-cancel-button]:appearance-none"
          />
          {focus.query && (
            <button type="button" aria-label="Clear search" onClick={() => setFocus({ query: '' })} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-tx3">
              <CircleX aria-hidden className="size-[18px]" />
            </button>
          )}
        </div>
      )}
      {ledger.length > 0 && (
        // The chips, as the phone's: always Category and the six filters; Before
        // departure once the journey has started (Patrik, 4 Oct: where he looked
        // for it); the family or the days a link asked for, with their ✕.
        <div ref={chips} className="sticky top-0 z-10 -mx-4 flex gap-1.5 overflow-x-auto bg-canvas px-4 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {started && (
            <button type="button" aria-pressed={!!focus.before} onClick={() => setFocus({ before: focus.before ? null : tripStart! })} className={chip(!!focus.before)}>
              Before departure{focus.before && <X aria-hidden className="size-[11px]" strokeWidth={3} />}
            </button>
          )}
          {(focus.family || focus.span || focus.between) && (
            <button type="button" onClick={() => setFocus({ family: null, span: null, between: false })} className={chip(true)} aria-label="Show every group and day">
              {focus.family && <>{swatch(GROUPS[focus.family].color)}{GROUPS[focus.family].label}</>}
              {focus.span && <span>{focus.family ? '· ' : ''}{spanText}</span>}
              {focus.between && 'Between stops'}
              <X aria-hidden className="size-[11px]" strokeWidth={3} />
            </button>
          )}
          <button type="button" onClick={() => setCatMenu(true)} aria-haspopup="dialog" className={chip(!!focus.category)}>
            {focus.category && swatch(categoryColor(focus.category))}
            {focus.category ? categoryLabel(focus.category) : 'Category'}
            <ChevronDown aria-hidden className="size-[11px]" strokeWidth={3} />
          </button>
          <div role="radiogroup" aria-label="Show" className="contents">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={focus.filter === f.id} onClick={() => setFocus({ filter: f.id })} className={chip(focus.filter === f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {ledger.length > 0 && isFocused(focus) && (
        <p role="status" className="-mt-1 px-1 text-[13px] text-tx2">{summaryLine(past, rates, fmt)}</p>
      )}

      {coming.length > 0 && (
        <div className="-mt-1 rounded-[16px] border-[1.5px] border-dashed border-ln2 px-[14px]">
          <button type="button" onClick={() => setComingOpen((o) => !o)} aria-expanded={comingOpen} className="flex min-h-11 w-full items-center gap-2 py-2 text-left text-[14px] text-tx2">
            <CalendarClock aria-hidden className="size-[16px] flex-none" strokeWidth={2.2} />
            <span className="flex-1">Coming up · {coming.length} {coming.length === 1 ? 'payment' : 'payments'}</span>
            <span className="font-medium">{fmt(comingTotal)}</span>
            <ChevronDown aria-hidden className={'size-4 flex-none transition-transform duration-[180ms]' + (comingOpen ? ' rotate-180' : '')} />
          </button>
          {comingOpen && (
            <div className="pb-2">
              <p className="pb-1 text-[12.5px] text-tx3">Dated after today, so not counted as spent yet.</p>
              {coming.map(comingRow)}
            </div>
          )}
        </div>
      )}

      {rows.length === 0 && (
        <p role="status" className="px-1 py-2 text-[15px] text-tx2">
          {query ? `No entries match “${query}”.` : isFocused(focus) ? 'No entries match this choice of chips.' : 'Nothing here yet.'}
        </p>
      )}

      {shownDays.map((d) => (
        <section key={d.date} id={`day-${d.date}`} aria-label={dayTitle(d.date, today!, tripStart)} className="scroll-mt-14">
          <div className="flex items-baseline justify-between gap-3 px-1 pb-1.5 text-[11.5px] font-semibold tracking-[.05em] text-tx3">
            <span>{dayTitle(d.date, today!, tripStart)}</span>
            {d.spent > 0 && <span className="tabular-nums">{fmt(d.spent)}</span>}
          </div>
          <div className="divide-y divide-ln rounded-[var(--r)] bg-sf px-[14px]">
            {d.entries.map((e) => (
              <LedgerRow key={e.id} entry={e} rates={rates} base={base} fmt={fmt} todayIso={today!} canEdit={canEdit} onOpen={(x) => setSheet({ entry: x })} onMenu={setMenu} />
            ))}
          </div>
        </section>
      ))}
      {shownRows < past.length && (
        <button type="button" onClick={() => setPages((n) => n + 1)} className="w-full rounded-[var(--rCtl)] border-[1.5px] border-ln2 py-2.5 text-base font-semibold text-ac2-deep">
          Load {Math.min(PAGE, past.length - shownRows)} more
        </button>
      )}
      {past.length > PAGE && <p className="-mt-1 text-center text-[13px] text-tx3">showing {shownRows} of {past.length}</p>}

      {catMenu && (
        <CategoryMenu
          used={used} current={focus.category}
          onPick={(id) => {
            // The menu promised a count over every entry, so the other chips go back to
            // All, and the row scrolls home so the state is in view (Petra, 14 Oct: a
            // category picked while "Beyond the everyday" was on, off-screen, showed nothing).
            setFocus({ category: id, family: null, span: null, between: false, filter: 'all' })
            setCatMenu(false)
            chips.current?.scrollTo({ left: 0, behavior: 'smooth' })
          }}
          onClose={() => setCatMenu(false)}
        />
      )}
      {menu && (
        <EntryMenu
          entry={menu}
          onEdit={() => { setMenu(null); setSheet({ entry: menu }) }}
          onLogAgain={!menu.source ? () => logAgain(menu) : undefined}
          onDelete={() => void remove(menu)}
          onClose={() => setMenu(null)}
        />
      )}
      {sheet && (
        <EntryEditor
          initial={sheet.entry}
          trip={trip.data}
          todayIso={today}
          mut={mut}
          stateMut={stateMut}
          onClose={() => setSheet(null)}
        />
      )}
      <ChargeNotice trip={trip.data} canEdit={canEdit} mut={mut} stateMut={stateMut} />
    </main>
  )
}

/** One row: a tap opens the form, a long press (or a right click) the menu. */
function LedgerRow({ entry, rates, base, fmt, todayIso, canEdit, onOpen, onMenu }: {
  entry: LedgerEntry
  rates: Record<string, number>
  base: string
  fmt: (n: number) => string
  todayIso: string
  canEdit: boolean
  onOpen: (e: LedgerEntry) => void
  onMenu: (e: LedgerEntry) => void
}) {
  const { handlers, firedRef } = useLongPress(() => onMenu(entry), { enabled: canEdit })
  return (
    <button
      type="button"
      disabled={!canEdit}
      {...handlers}
      onClick={() => {
        if (firedRef.current) { firedRef.current = false; return }
        onOpen(entry)
      }}
      className="block w-full select-none [-webkit-touch-callout:none]"
    >
      <EntryRow entry={entry} rates={rates} base={base} fmt={fmt} todayIso={todayIso} />
    </button>
  )
}

/** The Category chip's menu: the categories this journey has used, most used first, with their counts. */
function CategoryMenu({ used, current, onPick, onClose }: {
  used: { id: string; count: number }[]
  current: string | null
  onPick: (id: string | null) => void
  onClose: () => void
}) {
  return (
    <Sheet label="Category" onClose={onClose}>
      <div className="-mt-1 text-center text-base font-semibold text-tx">Category</div>
      <div className="divide-y divide-ln">
        {current && (
          <button type="button" onClick={() => onPick(null)} className="flex min-h-12 w-full items-center gap-3 text-left text-base font-medium text-tx">
            <span className="flex size-[26px] flex-none items-center justify-center text-tx2"><X aria-hidden className="size-[16px]" strokeWidth={2.4} /></span>
            All categories
          </button>
        )}
        {used.map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c.id)} aria-current={c.id === current ? 'true' : undefined} className="flex min-h-12 w-full items-center gap-3 text-left text-base font-medium text-tx">
            <CategoryTile id={c.id} size={26} />
            <span className="min-w-0 flex-1 truncate">{categoryLabel(c.id)}</span>
            <span className="flex-none text-[13.5px] text-tx2">{c.count}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/** The long-press menu on a row (the phone's swipes): Log again, Edit, Delete. */
function EntryMenu({ entry, onEdit, onLogAgain, onDelete, onClose }: {
  entry: LedgerEntry
  onEdit: () => void
  /** none for a row the plan or a subscription wrote: those come back on their own */
  onLogAgain?: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const item = (label: string, Icon: LucideIcon, act: () => void, warn = false) => (
    <button key={label} type="button" onClick={act} className={'flex min-h-12 w-full items-center gap-3 text-left text-base font-medium ' + (warn ? 'text-warn' : 'text-tx')}>
      <Icon aria-hidden className="size-[18px] flex-none" strokeWidth={2} /> {label}
    </button>
  )
  return (
    <Sheet label={entryLabel(entry)} onClose={onClose}>
      <div className="-mt-1 truncate text-center text-base font-semibold text-tx">{entryLabel(entry)}</div>
      <div className="divide-y divide-ln">
        {onLogAgain && item('Log again', RotateCcw, onLogAgain)}
        {item('Edit', Pencil, onEdit)}
        {item('Delete', Trash2, onDelete, true)}
      </div>
    </Sheet>
  )
}
