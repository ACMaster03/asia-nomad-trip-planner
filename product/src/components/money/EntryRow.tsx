import { categoryLabel, isEverydayCategory } from '@/lib/trips/categories'
import { toBase } from '@/lib/trips/format'
import { originalAmount, relativeDay } from '@/lib/trips/moneyText'
import { everydaySwitchable, isEverydayRow } from '@/lib/trips/spending'
import type { LedgerEntry } from '@/lib/trips/types'
import { CategoryTile } from './CategoryTile'

// One ledger row (the phone's EntryRow): the category tile, the name, the day
// and a detail, the amount. No category word: the tile shows it (Patrik, 28
// Sep: fewer facts per row). The detail says why a row is here when that is
// not obvious: the original charge in another currency, "from booking",
// "added by itself", "not in daily average".

export function EntryRow({ entry, rates, base, fmt, todayIso, dated = false }: {
  entry: LedgerEntry
  rates: Record<string, number>
  base: string
  fmt: (n: number) => string
  todayIso: string
  /** "today", "yesterday", "12 Sep" first (Latest); the list screens date their sections */
  dated?: boolean
}) {
  const e = entry
  const inBase = toBase(e.amount, e.currency, rates)
  const expense = e.type !== 'income'
  // Out of the daily average by its own switch.
  const hollow = !e.source && expense && isEverydayCategory(e.category) && !isEverydayRow(e)
  const imported = e.source?.kind === 'stay' || e.source?.kind === 'transport' || e.source?.kind === 'extra'
  const parts: string[] = []
  if (dated) parts.push(relativeDay(e.date, todayIso))
  if (e.currency && e.currency !== base) parts.push(originalAmount(e.amount, e.currency))
  if (e.orphaned) parts.push('booking removed')
  else if (e.source?.kind === 'sub') parts.push('added by itself')
  else if (imported) parts.push('from booking')
  else if (hollow) parts.push('not in daily average')
  else if (!e.source && expense && everydaySwitchable(e.category) && !isEverydayCategory(e.category) && isEverydayRow(e)) parts.push('in daily average')
  return (
    <span className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left">
      <CategoryTile id={e.category} size={32} hollow={hollow} badge={e.source?.kind === 'sub' ? 'repeat' : imported ? 'link' : undefined} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-tx">{e.note?.trim() || categoryLabel(e.category)}</span>
        {parts.length > 0 && <span className={'block truncate text-[12.5px] ' + (e.orphaned ? 'text-warn' : 'text-tx2')}>{parts.join(' · ')}</span>}
      </span>
      <span className={'flex-none text-[15px] font-semibold tabular-nums ' + (expense ? 'text-tx' : 'text-ac')}>
        {expense ? '' : '+'}{fmt(inBase)}
      </span>
    </span>
  )
}
