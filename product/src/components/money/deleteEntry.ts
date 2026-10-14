import type { useConfirm } from '@/components/Confirm'
import { sourceKey } from '@/lib/trips/importCosts'
import { categoryLabel } from '@/lib/trips/categories'
import type { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import type { useTripMutation } from '@/lib/trips/useTripMutation'
import type { LedgerEntry } from '@/lib/trips/types'

/** What a row is called: its name, or its category when it has none. */
export const entryLabel = (e: LedgerEntry) => e.note?.trim() || categoryLabel(e.category)

/**
 * Deleting an entry, shared by the entry form and the row menu on All entries
 * (round 4b). It asks first, and what it asks depends on who wrote the row: a
 * subscription's charge or an imported booking needs a skip record too, or the
 * plan sync writes the row again on the next visit. True when it deleted.
 */
export async function deleteEntry(
  entry: LedgerEntry,
  { confirm, mut, stateMut, toast }: {
    confirm: ReturnType<typeof useConfirm>
    mut: ReturnType<typeof useLedgerMutation>
    stateMut: ReturnType<typeof useTripMutation>
    toast: (msg: string) => void
  },
): Promise<boolean> {
  if (entry.source?.kind === 'sub') {
    // A charge the app wrote (importCosts.ts). The skip record keeps the
    // sync from writing it again; the subscription itself stays.
    const ok = await confirm({
      title: 'Remove this charge?',
      body: `${entry.note || 'The subscription'} stays on your subscriptions. This charge won’t be added again.`,
      confirmLabel: 'Remove',
    })
    if (!ok) return false
    const key = sourceKey(entry.source)
    stateMut.mutate(
      (cur) => ({ ...cur, importSkip: [...new Set([...(cur.importSkip ?? []), key])] }),
      { onSuccess: () => mut.mutate({ kind: 'delete', id: entry.id }) },
    )
  } else if (entry.source && entry.source.kind !== 'extra') {
    // Without the skip record, reconcile would resurrect the row next visit.
    // (A paid one-off's row from before #39 is a plain entry: nothing
    // imports it again.)
    const ok = await confirm({
      title: 'Remove this imported cost?',
      body: 'The booking stays on the Trip page, but it won’t be re-imported here.',
      confirmLabel: 'Remove',
    })
    if (!ok) return false
    const key = sourceKey(entry.source)
    // Persist the skip BEFORE deleting: a ledger refetch landing between the
    // two writes would otherwise re-import the row.
    stateMut.mutate(
      (cur) => ({ ...cur, importSkip: [...new Set([...(cur.importSkip ?? []), key])] }),
      { onSuccess: () => mut.mutate({ kind: 'delete', id: entry.id }) },
    )
  } else {
    if (!(await confirm({ title: 'Delete this entry?' }))) return false
    mut.mutate({ kind: 'delete', id: entry.id })
  }
  toast(`Deleted · ${entryLabel(entry)}`)
  return true
}
