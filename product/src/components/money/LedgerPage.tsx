'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripRole } from '@/lib/trips/useTripRole'
import { usePlanSync } from '@/lib/trips/usePlanSync'
import { useToday } from '@/lib/useToday'
import { SaveError } from '@/components/trips/SaveError'
import { ViewerNotice } from '@/components/trips/ViewerNotice'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import type { LedgerEntry } from '@/lib/trips/types'
import { LedgerList } from './LedgerList'
import { EntryEditor } from './EntryEditor'

// All entries, the ledger's own screen (Petra, 23 Sep; #38). As the last card
// on Money it was over a third of that page, 20 rows long, under nine other
// cards. Here it is the whole screen, reached from Latest's "all entries",
// from the All entries row at the bottom of Money, and from a chart bar's
// "Open in All entries", which opens it at that day. The name is Petra's:
// Patrik wanted a plainer word than ledger, which she had not met before. Rows
// edit exactly as they do on Money (EntryEditor). Adding stays on Money, next
// to the page that shows what an entry changes.
export default function LedgerPage({ day }: { day?: string }) {
  const { fmt, base } = useMoney()
  const { trip } = useTripScreen()
  const mut = useLedgerMutation()
  const stateMut = useTripMutation()
  const { canEdit } = useTripRole()
  const today = useToday()
  const [sheet, setSheet] = useState<{ entry: LedgerEntry } | null>(null)
  // Stable, so the list scrolls to the day once rather than after every edit.
  const reveal = useMemo(() => (day ? { date: day, n: 1 } : null), [day])
  usePlanSync(trip.data, canEdit, mut)

  if (trip.isPending || (trip.data && !today)) {
    return <main className="mx-auto max-w-xl p-6 text-base text-tx2">Loading…</main>
  }
  if (!trip.data || !today) return <CreateTripEmptyState />
  const s = trip.data.state
  const n = trip.data.ledger.length

  return (
    <main className="mx-auto grid w-full max-w-xl grid-cols-1 items-start gap-3 px-[18px] pb-6 pt-[10px] text-tx">
      <div>
        <Link href="/money" className="-ml-1.5 inline-flex min-h-11 items-center text-base font-semibold text-ac2-deep">
          <ChevronLeft aria-hidden className="size-5" />Money
        </Link>
        <h1 className="font-serif text-[25px] font-semibold leading-[1.15] tracking-[-.01em]">All entries</h1>
        <p className="mt-0.5 text-[14px] text-tx2">
          {s.meta.tripName} · {n} {n === 1 ? 'entry' : 'entries'}{canEdit && n > 0 ? ' · tap a row to edit' : ''}
        </p>
      </div>
      <ViewerNotice />
      <div>
        <SaveError show={mut.isError} error={mut.error} />
        <SaveError show={stateMut.isError} error={stateMut.error} />
      </div>
      <LedgerList
        entries={trip.data.ledger} rates={s.rates} base={base} fmt={fmt} tripStart={s.meta.startDate || undefined}
        todayIso={today} canEdit={canEdit} onEdit={(e) => setSheet({ entry: e })} reveal={reveal}
      />
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
    </main>
  )
}
