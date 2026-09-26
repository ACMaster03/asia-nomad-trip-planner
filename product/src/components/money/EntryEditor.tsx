'use client'
import { useMoney } from '@/lib/trips/Money'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { sourceKey } from '@/lib/trips/importCosts'
import { pickEntryCurrency } from '@/lib/trips/entryCurrency'
import { countryCurrencies } from '@/lib/catalogue/countryCurrencies'
import { currentStop } from '@/lib/trips/moneyModel'
import { tripPace } from '@/lib/trips/spending'
import { categoryLabel } from '@/lib/trips/categories'
import { toBase } from '@/lib/trips/format'
import type { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import type { useTripMutation } from '@/lib/trips/useTripMutation'
import type { LedgerEntry, Trip } from '@/lib/trips/types'
import { EntrySheet, type SubChange } from './EntrySheet'

// The entry sheet with what saving and deleting mean, shared by Money and All
// entries so a row edits the same way on both. The page owns whether the
// sheet is open and the two mutations, because its save-error banners watch
// them.
export function EntryEditor({ initial, trip, todayIso, mut, stateMut, onClose, onAdded, note }: {
  /** null for a new entry */
  initial: LedgerEntry | null
  trip: Trip
  todayIso: string
  mut: ReturnType<typeof useLedgerMutation>
  stateMut: ReturnType<typeof useTripMutation>
  onClose: () => void
  /** after a new entry is saved */
  onAdded?: () => void
  /** one line above the save button */
  note?: string
}) {
  const { fmt, base } = useMoney()
  const confirm = useConfirm()
  const toast = useToast()
  const s = trip.state
  const ledger = trip.ledger

  // A new entry opens on the money you are actually holding today. The current
  // stop is the one that contains today's date, so there is none before
  // departure and on the days between stops, and the sheet falls back to what
  // you last typed.
  const current = currentStop(s, todayIso)
  const lastCur = ledger.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).find((e) => e.type === 'expense')?.currency ?? base
  const hereCodes = countryCurrencies(current?.country)
  // What "a usual day" is for the daily-average switch (#36): the pace without
  // this entry, so editing the concert ticket is not measured against itself.
  const pace = tripPace(s, initial ? ledger.filter((e) => e.id !== initial.id) : ledger, todayIso, current).perDay
  const entryCur = pickEntryCurrency({
    hereCodes,
    watched: Object.keys(s.rates ?? {}),
    lastUsed: lastCur,
    base,
  })

  function save(entry: LedgerEntry, change?: SubChange, replaceId?: string) {
    const isNew = !initial
    mut.mutate({ kind: 'upsert', entry })
    // A charge logged by hand replaces the row the app wrote for it; with the
    // entry linked, the sync sees the charge covered and writes nothing.
    if (replaceId) mut.mutate({ kind: 'delete', id: replaceId })
    // The Subscriptions question (EntrySheet): the charge declares the
    // subscription, or corrects its cadence and reminder.
    if (change?.kind === 'create') {
      stateMut.mutate((cur) => ({ ...cur, subscriptions: [...(cur.subscriptions ?? []), change.sub] }))
    } else if (change?.kind === 'update') {
      stateMut.mutate((cur) => ({
        ...cur,
        subscriptions: (cur.subscriptions ?? []).map((x) => (x.id === change.id
          ? { ...x, everyMonths: change.everyMonths, ...(change.remind ? { remind: true, leadDays: x.leadDays ?? 3 } : { remind: false }) }
          : x)),
      }))
    }
    onClose()
    if (isNew) onAdded?.()
    // The two-second confirmation (mock 16 §3): what landed, so nobody scrolls to check.
    toast(`${isNew ? 'Added' : 'Saved'} · ${fmt(toBase(entry.amount, entry.currency, s.rates))} · ${entry.note?.trim() || categoryLabel(entry.category)}${change?.kind === 'create' ? ' · now a subscription' : ''}`)
  }
  async function del(entry: LedgerEntry) {
    const listedExtra = entry.source?.kind === 'extra' ? s.extras.find((x) => x.id === entry.source!.id) : undefined
    if (listedExtra) {
      // The paid-on date IS this row (importCosts.ts): clear the date and the
      // plan sync (usePlanSync) deletes the row — one write, no skip record,
      // and setting the date again brings the payment back.
      const ok = await confirm({
        title: 'Remove this payment?',
        body: `“${listedExtra.label}” goes back to not paid on the Trip page. Give it a paid-on date again to bring the payment back.`,
        confirmLabel: 'Remove',
      })
      if (!ok) return
      stateMut.mutate((cur) => ({
        ...cur,
        extras: cur.extras.map((x) => (x.id === listedExtra.id ? { ...x, paidOn: undefined } : x)),
      }))
    } else if (entry.source?.kind === 'sub') {
      // A charge the app wrote (importCosts.ts). The skip record keeps the
      // sync from writing it again; the subscription itself stays.
      const ok = await confirm({
        title: 'Remove this charge?',
        body: `${entry.note || 'The subscription'} stays on your subscriptions. This charge won’t be added again.`,
        confirmLabel: 'Remove',
      })
      if (!ok) return
      const key = sourceKey(entry.source)
      stateMut.mutate(
        (cur) => ({ ...cur, importSkip: [...new Set([...(cur.importSkip ?? []), key])] }),
        { onSuccess: () => mut.mutate({ kind: 'delete', id: entry.id }) },
      )
    } else if (entry.source) {
      // Without the skip record, reconcile would resurrect the row next visit.
      const ok = await confirm({
        title: 'Remove this imported cost?',
        body: 'The booking stays on the Trip page, but it won’t be re-imported here.',
        confirmLabel: 'Remove',
      })
      if (!ok) return
      const key = sourceKey(entry.source)
      // Persist the skip BEFORE deleting: a ledger refetch landing between the
      // two writes would otherwise re-import the row.
      stateMut.mutate(
        (cur) => ({ ...cur, importSkip: [...new Set([...(cur.importSkip ?? []), key])] }),
        { onSuccess: () => mut.mutate({ kind: 'delete', id: entry.id }) },
      )
    } else {
      if (!(await confirm({ title: 'Delete this entry?' }))) return
      mut.mutate({ kind: 'delete', id: entry.id })
    }
    onClose()
  }

  return (
    <EntrySheet
      initial={initial}
      ledger={ledger}
      rates={s.rates}
      subs={s.subscriptions ?? []}
      defaultCur={entryCur}
      defaultCurWhere={hereCodes.includes(entryCur) ? current?.country : null}
      onSave={save}
      onDelete={initial ? del : undefined}
      onClose={onClose}
      note={note}
      pace={pace}
    />
  )
}
