'use client'
import Link from 'next/link'
import type { LedgerEntry } from '@/lib/trips/types'
import { CardLabel } from './CardLabel'
import { EntryRow } from './EntryRow'
import { useZoom } from '@/lib/motion/useZoom'

// Latest (the phone's LatestCard): the last three entries YOU LOGGED, right
// under the top card (mock 16 §3, Petra, round 1: after adding an entry she
// scrolled to the bottom of the page to check it had landed), and the door
// to All entries. Imported bookings are left out (Petra, 23 Sep): they are
// not something you just did, and a stay charged next month would sit at the
// top of a strip about today.

export function LatestCard({ entries, rates, base, fmt, todayIso, canEdit, onEdit }: {
  entries: LedgerEntry[]
  rates: Record<string, number>
  base: string
  fmt: (n: number) => string
  todayIso: string
  canEdit: boolean
  onEdit: (e: LedgerEntry) => void
}) {
  const zoom = useZoom()
  // Newest date first; on the same day, the one added last is the newest.
  const rows = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.source && !!e.date && e.date <= todayIso)
    .sort((a, b) => (a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : b.i - a.i))
    .slice(0, 3)
    .map(({ e }) => e)
  return (
    // The card All entries grows out of, and shrinks back into (round 6; the phone's ZoomSource "entries").
    <div className="lv-enter lv-settle rounded-[var(--r)] bg-sf px-4 py-3 text-tx" style={{ viewTransitionName: 'money-latest' }}>
      <div className={'flex items-center justify-between gap-3' + (rows.length ? ' pb-1' : '')}>
        <CardLabel mauve>Latest</CardLabel>
        {/* prefetch: the whole page fetched while Money is open, so the tap opens it at once (Petra, 14 Oct). */}
        <Link href="/money/entries" prefetch onClick={zoom.link('money-latest', 'entries')} className="text-[13.5px] font-medium text-ac">All entries ›</Link>
      </div>
      {rows.length === 0 && <p className="py-2.5 text-[14px] text-tx2">Nothing typed yet. Tap + to log the first thing you buy.</p>}
      <div className="divide-y divide-ln">
        {rows.map((e) => (
          <button key={e.id} type="button" disabled={!canEdit} onClick={() => onEdit(e)} className="block w-full">
            <EntryRow entry={e} rates={rates} base={base} fmt={fmt} todayIso={todayIso} dated />
          </button>
        ))}
      </div>
    </div>
  )
}
