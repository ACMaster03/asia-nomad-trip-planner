import type { LedgerEntry } from './types'

// A ledger mutation is a single-entry operation, mirrored 1:1 by the merge RPCs
// (migration 06): upsert replaces/appends ONE entry by id, delete removes ONE.
export type LedgerOp = { kind: 'upsert'; entry: LedgerEntry } | { kind: 'delete'; id: string }

/** The scope every ledger write shares, so they reach the server one at a time. */
export const LEDGER_SCOPE = 'ledger-write'

/** Two ops with the same key write the same thing. */
export const opKey = (op: LedgerOp) =>
  op.kind === 'delete' ? `delete:${op.id}` : `upsert:${op.entry.id}:${JSON.stringify(op.entry)}`

/**
 * The ops that are not already waiting to be written (Money reload loop,
 * 25 Sep 2026). The plan sync runs every time the trip document changes, and
 * while a batch of writes queues up behind the first one, each write's refetch
 * lands a document that lacks the rest of the batch: the sync then saw them as
 * missing and queued them again. Twenty writes became hundreds, the page
 * re-rendered for each, and the iPhone app reloaded itself until the queue
 * drained. An op already queued is on its way; queueing it again adds nothing.
 */
export function notPending<T extends LedgerOp>(ops: T[], pending: Iterable<LedgerOp>): T[] {
  const queued = new Set<string>()
  for (const op of pending) queued.add(opKey(op))
  return ops.filter((op) => !queued.has(opKey(op)))
}
