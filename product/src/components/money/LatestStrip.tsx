'use client'
import Link from 'next/link'
import { categoryLabel } from '@/lib/trips/categories'
import { toBase } from '@/lib/trips/format'
import type { LedgerEntry } from '@/lib/trips/types'

// Latest — the last three entries YOU LOGGED, right under the overview (mock
// 16 §3, Petra, round 1: after adding an entry she scrolled to the bottom of
// the page to check it had landed). Three rows and a link to the full list,
// which has had a screen of its own since 23 Sep, All entries (Petra: the page
// was too long, and the ledger alone was over a third of it).
//
// Imported bookings are left out (Petra, 23 Sep, on the live page): they are
// not something you just did, and they are dated by their charge date, which
// can be in the future, so a stay charged next month sat at the top of a
// strip about today.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const when = (iso: string, todayIso: string) => {
  if (iso === todayIso) return 'today'
  const d = new Date(iso + 'T00:00:00Z')
  const t = new Date(todayIso + 'T00:00:00Z')
  if (t.getTime() - d.getTime() === 86_400_000) return 'yesterday'
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export function LatestStrip({ entries, rates, fmt, todayIso, canEdit, onEdit }: {
  entries: LedgerEntry[]
  rates: Record<string, number>
  fmt: (n: number) => string
  todayIso: string
  canEdit: boolean
  onEdit: (e: LedgerEntry) => void
}) {
  // Newest date first; on the same day, the one added last is the newest.
  const rows = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.source && e.date <= todayIso)
    .sort((a, b) => (a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : b.i - a.i))
    .slice(0, 3)
  if (!rows.length) return null
  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] pb-1 pt-1.5 text-tx">
      <div className="flex items-center justify-between border-b border-ln py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">Latest</span>
        <Link href="/money/entries" className="text-[13px] text-tx3">all entries ›</Link>
      </div>
      {rows.map(({ e }) => (
        <button
          key={e.id}
          type="button"
          disabled={!canEdit}
          onClick={() => onEdit(e)}
          className="flex w-full items-start justify-between gap-3 border-t border-ln py-2.5 text-left first:border-t-0"
        >
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold">{e.note?.trim() || categoryLabel(e.category)}</span>
            <span className="block text-[13px] text-tx2">
              {categoryLabel(e.category)} · {when(e.date, todayIso)}
            </span>
          </span>
          <span className={'flex-none text-base font-semibold tabular-nums' + (e.type === 'income' ? ' text-ac' : '')}>
            {e.type === 'income' ? '+ ' : ''}{fmt(toBase(e.amount, e.currency, rates))}
          </span>
        </button>
      ))}
    </div>
  )
}
