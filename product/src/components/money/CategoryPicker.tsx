'use client'
import { useState } from 'react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { categoriesFor, isEverydayCategory, mostUsedCategories, categoryDef, type CategoryKind } from '@/lib/trips/categories'
import type { LedgerEntry } from '@/lib/trips/types'

// "All 19…" — the full registry as a searchable, grouped list. Grouped the way
// the analytics think (everyday vs bookings & one-offs), the trip's most-used
// on top. Search matches label, hint and every alias, so "grab" finds
// Getting around. No "create your own": the enum stays code-owned.

const input =
  'w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base text-tx outline-none focus:border-ac'

export function CategoryPicker({
  kind, ledger, selected, onPick, onClose,
}: {
  kind: CategoryKind
  ledger: LedgerEntry[]
  selected: string | null
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const all = categoriesFor(kind)
  const folded = q.trim().toLowerCase()
  const matches = (id: string) => {
    if (!folded) return true
    const c = categoryDef(id)
    if (!c) return false
    return [c.label, c.hint ?? '', ...c.aliases].some((t) => t.toLowerCase().includes(folded))
  }
  // "Most used here" is a shortcut for browsing; while searching it would
  // only duplicate the hit under its real group
  const top = folded ? [] : mostUsedCategories(ledger, kind, 3)
  const groups: [string, string[]][] =
    kind === 'expense'
      ? [
          ['Most used here', top],
          ['Everyday', all.filter((c) => isEverydayCategory(c.id)).map((c) => c.id).filter(matches)],
          ['Bookings & one-offs', all.filter((c) => !isEverydayCategory(c.id)).map((c) => c.id).filter(matches)],
        ]
      : [['Income', all.map((c) => c.id).filter(matches)]]
  const empty = groups.every(([, ids]) => ids.length === 0)

  return (
    <Sheet label="Category" onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-[20px] font-semibold">Category</h3>
        <button onClick={onClose} aria-label="Close" className="-m-2 flex size-11 items-center justify-center text-tx3">✕</button>
      </div>
      {/* Not autofocused: on a phone the keyboard would cover most of the list
          and jump the sheet on every open (report, 2026-09-13). Browsing is the
          default; search is one tap away for the rare lookup. */}
      <input
        type="search"
        enterKeyHint="search"
        aria-label="Search categories"
        className={input}
        placeholder="Search categories"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="flex flex-col">
        {groups.map(([title, ids]) =>
          ids.length ? (
            <div key={title}>
              <div className="pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-[.09em] text-tx3">{title}</div>
              {ids.map((id) => {
                const c = categoryDef(id)!
                const on = id === selected
                return (
                  <button
                    key={title + id}
                    onClick={() => onPick(id)}
                    className={
                      'flex min-h-11 w-full items-center justify-between gap-3 border-t border-ln px-1 py-2.5 text-left text-base ' +
                      (on ? 'font-semibold text-ac' : '')
                    }
                  >
                    <span>
                      {c.label}
                      {c.hint && <span className="text-[13px] text-tx3"> · {c.hint}</span>}
                    </span>
                    <span className="text-tx3">{on ? '✓' : '›'}</span>
                  </button>
                )
              })}
            </div>
          ) : null,
        )}
        {empty && <p className="py-4 text-base text-tx2">Nothing matches “{q}”. Try a plainer word. The closest category is probably in Everyday.</p>}
      </div>
    </Sheet>
  )
}
