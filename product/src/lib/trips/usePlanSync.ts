'use client'
import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { planImports, type ImportPlan } from './importCosts'
import { LEDGER_SCOPE, notPending, type LedgerOp } from './ledgerOps'
import { useToday } from '../useToday'
import type { useLedgerMutation } from './useLedgerMutation'
import type { Trip } from './types'

// Plan → ledger sync (importCosts.ts), run by both screens that show the
// ledger, Money and All entries, so an edit on the Trip page or a
// one-off's cleared paid-on date lands whichever of them is open. Converges:
// every upsert is deterministic, so once the refetched document matches the
// plan this returns three empty arrays and the effect below no-ops. The page
// passes its ledger mutation, because its save-error banner watches it.
//
// Writes already queued are skipped (ledgerOps.ts, notPending): a refetch that
// lands mid-batch shows the rest of the batch as missing, and queueing it
// again made the iPhone app reload itself over and over (25 Sep 2026).
//
// It also writes the subscription charges whose date has come (Patrik,
// 24 Sep, #37), whatever autoImport says: that switch is about bookings. Home
// runs it as well, so a charge lands wherever the app is opened.
export function usePlanSync(
  trip: Trip | null | undefined,
  canEdit: boolean,
  mut: ReturnType<typeof useLedgerMutation>,
): ImportPlan | null {
  const today = useToday()
  const qc = useQueryClient()
  const imp = useMemo(() => (trip ? planImports(trip.state, trip.ledger, today) : null), [trip, today])
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
    const upserts = [...imp.updates, ...imp.orphans, ...(autoImport !== false ? imp.candidates : []), ...imp.subCharges]
    const ops: LedgerOp[] = [
      ...upserts.map((entry) => ({ kind: 'upsert' as const, entry })),
      ...imp.removals.map((entry) => ({ kind: 'delete' as const, id: entry.id })),
    ]
    const queued = qc.getMutationCache().findAll({ status: 'pending' })
      .filter((m) => m.options.scope?.id === LEDGER_SCOPE)
      .map((m) => m.state.variables as LedgerOp)
    notPending(ops, queued).forEach((op) => mut.mutate(op))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mut and qc are stable; imp derives from trip
  }, [imp, autoImport, canEdit])
  return imp
}
