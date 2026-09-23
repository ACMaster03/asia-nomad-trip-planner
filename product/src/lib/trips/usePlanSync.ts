'use client'
import { useEffect, useMemo } from 'react'
import { planImports, type ImportPlan } from './importCosts'
import type { useLedgerMutation } from './useLedgerMutation'
import type { Trip } from './types'

// Plan → ledger sync (importCosts.ts), run by both screens that show the
// ledger, Money and All entries, so an edit on the Trip page or a
// one-off's cleared paid-on date lands whichever of them is open. Converges:
// every upsert is deterministic, so once the refetched document matches the
// plan this returns three empty arrays and the effect below no-ops. The page
// passes its ledger mutation, because its save-error banner watches it.
export function usePlanSync(
  trip: Trip | null | undefined,
  canEdit: boolean,
  mut: ReturnType<typeof useLedgerMutation>,
): ImportPlan | null {
  const imp = useMemo(() => (trip ? planImports(trip.state, trip.ledger) : null), [trip])
  const autoImport = trip?.state.autoImport
  useEffect(() => {
    if (!imp) return
    // A viewer must never trigger this: the writes would all bounce off RLS and
    // paint a save-error banner every time they merely OPENED the screen.
    if (!canEdit) return
    // Corrections to already-imported rows always apply (one-way sync + orphan
    // flags, and the removal of an extra's row once its paid-on date is
    // cleared). NEW rows flow automatically too unless the user switched that
    // off: a booked stay with a charge date IS money spent (owner review
    // 2026-09-12). `false` is the only value that keeps the ask-first card.
    const ops = [...imp.updates, ...imp.orphans, ...(autoImport !== false ? imp.candidates : [])]
    ops.forEach((entry) => mut.mutate({ kind: 'upsert', entry }))
    imp.removals.forEach((entry) => mut.mutate({ kind: 'delete', id: entry.id }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mut is stable; imp derives from trip
  }, [imp, autoImport, canEdit])
  return imp
}
