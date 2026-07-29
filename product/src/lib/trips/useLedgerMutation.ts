'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ledgerUpsertEntry, ledgerDeleteEntry, isPermissionDenied } from './queries'
import { tk } from './keys'
import { useTripScope } from './TripScope'
import type { Ledger, LedgerEntry, Trip } from './types'

// A ledger mutation is a single-entry operation, mirrored 1:1 by the merge RPCs
// (migration 06): upsert replaces/appends ONE entry by id, delete removes ONE.
// Whole-array writes are gone, so two devices editing money at the same time can
// no longer wipe each other's entries.
export type LedgerOp = { kind: 'upsert'; entry: LedgerEntry } | { kind: 'delete'; id: string }

// Same op applied locally for the optimistic cache update.
function applyOp(ledger: Ledger, op: LedgerOp): Ledger {
  return op.kind === 'delete'
    ? ledger.filter((e) => e.id !== op.id)
    : [...ledger.filter((e) => e.id !== op.entry.id), op.entry]
}

// `scope` serializes the network writes so they apply one at a time; onSettled
// reconciles with the DB truth. trip id is read from cache (no render-captured id).
export function useLedgerMutation() {
  const sb = createClient()
  const qc = useQueryClient()
  const { tripId } = useTripScope()
  const key = tk.trip(tripId ?? 'none')
  return useMutation({
    scope: { id: 'ledger-write' },
    mutationFn: async (op: LedgerOp) => {
      // onMutate (which runs first) has ALREADY applied `op` to the cached
      // ledger, and `scope` serializes mutations — the cache is the truth here.
      // (applyOp happens to be idempotent, but we still don't re-apply it: the
      // state-mutation twin had a real double-apply bug from doing so.)
      const trip = qc.getQueryData<Trip>(key)
      if (!trip) throw new Error('No active trip')
      const newRev =
        op.kind === 'delete'
          ? await ledgerDeleteEntry(sb, trip.id, op.id)
          : await ledgerUpsertEntry(sb, trip.id, op.entry)
      // Sync the cached rev immediately — the next queued write reads it from
      // cache before the onSettled refetch has landed.
      qc.setQueryData<Trip>(key, (t) => (t ? { ...t, ledger_rev: newRev } : t))
      return trip.ledger
    },
    onMutate: async (op: LedgerOp) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Trip>(key)
      if (prev) qc.setQueryData<Trip>(key, { ...prev, ledger: applyOp(prev.ledger, op) })
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      // Revoked mid-session — re-resolve the role (see useTripMutation).
      if (isPermissionDenied(e)) qc.invalidateQueries({ queryKey: tk.role(tripId ?? 'none') })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
