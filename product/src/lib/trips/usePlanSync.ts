'use client'
import { useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { planImports, type ImportPlan } from './importCosts'
import { LEDGER_SCOPE, notPending, type LedgerOp } from './ledgerOps'
import { useToday } from '../useToday'
import type { useLedgerMutation } from './useLedgerMutation'
import { useTripMutation } from './useTripMutation'
import type { Trip } from './types'

// Plan → ledger sync (importCosts.ts), run by both screens that show the
// ledger, Money and All entries, so an edit on the Trip page lands whichever
// of them is open. Converges: every upsert is deterministic, so once the
// refetched document matches the plan this returns empty arrays and the
// effect below no-ops. The page
// passes its ledger mutation, because its save-error banner watches it.
//
// Writes already queued are skipped (ledgerOps.ts, notPending): a refetch that
// lands mid-batch shows the rest of the batch as missing, and queueing it
// again made the iPhone app reload itself over and over (25 Sep 2026).
//
// It also writes the subscription charges whose date has come (Patrik,
// 24 Sep, #37), whatever autoImport says: that switch is about bookings. Home
// runs it as well, so a charge lands wherever the app is opened.
//
// And it clears out the One-offs (#39, Patrik, 26 Sep), once per journey: a
// paid one-off's row becomes a plain entry (importCosts.ts), and then the
// planned list is deleted from the journey, unpaid ones included: they were
// plans, never payments. The list goes only once no row is left marked as a
// one-off, so the payments are plain entries first. That write is its own, not
// the page's: when both phones open the app at once, the second one's write
// loses to the first, and the page's banner would ask someone to "redo your
// edit" who never made one. It fails quietly and is tried again on the next
// open, if the list is still there.
export function usePlanSync(
  trip: Trip | null | undefined,
  canEdit: boolean,
  mut: ReturnType<typeof useLedgerMutation>,
): ImportPlan | null {
  const today = useToday()
  const qc = useQueryClient()
  const dropMut = useTripMutation()
  const imp = useMemo(() => (trip ? planImports(trip.state, trip.ledger, today) : null), [trip, today])
  const autoImport = trip?.state.autoImport
  useEffect(() => {
    if (!imp) return
    // A viewer must never trigger this: the writes would all bounce off RLS and
    // paint a save-error banner every time they merely OPENED the screen.
    if (!canEdit) return
    // Corrections to already-imported rows always apply (one-way sync + orphan
    // flags, and a paid one-off's row turned plain, #39). NEW rows flow
    // automatically too unless the user switched that off: a booked stay with
    // a charge date IS money spent (owner review 2026-09-12). `false` is the
    // only value that keeps the ask-first card.
    const upserts = [...imp.updates, ...imp.orphans, ...(autoImport !== false ? imp.candidates : []), ...imp.subCharges]
    const ops: LedgerOp[] = upserts.map((entry) => ({ kind: 'upsert' as const, entry }))
    const queued = qc.getMutationCache().findAll({ status: 'pending' })
      .filter((m) => m.options.scope?.id === LEDGER_SCOPE)
      .map((m) => m.state.variables as LedgerOp)
    notPending(ops, queued).forEach((op) => mut.mutate(op))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mut and qc are stable; imp derives from trip
  }, [imp, autoImport, canEdit])

  // Asked for once while the write is on its way (a refetch landing first
  // would ask again, as in the reload loop of 25 Sep).
  const dropping = useRef<string | null>(null)
  const tripId = trip?.id
  const hasList = trip ? trip.state.extras !== undefined : false
  const oneOffRows = trip ? trip.ledger.some((e) => e.source?.kind === 'extra') : false
  useEffect(() => {
    if (!tripId || !canEdit || !hasList || oneOffRows || dropping.current === tripId) return
    dropping.current = tripId
    dropMut.mutate(
      (cur) => {
        const next = { ...cur }
        delete next.extras
        return next
      },
      { onError: () => { dropping.current = null } },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dropMut is stable
  }, [tripId, canEdit, hasList, oneOffRows])
  return imp
}
