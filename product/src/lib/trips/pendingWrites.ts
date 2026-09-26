import { LEDGER_SCOPE } from './ledgerOps.ts'
import type { Trip } from './types'

/** The scope every write of the trip's `state` shares (useTripMutation). */
export const STATE_SCOPE = 'state-write'
export { LEDGER_SCOPE }

/**
 * A refetched trip document, minus what writes still on their way would undo.
 *
 * Writes queue one behind another, and each finished write refetches the trip.
 * That refetch can land while later writes are still queued, and it holds
 * none of them. Landing it as is wiped their edits from the cache: a queued
 * `state` write then saved the refetched document, without its own edit and
 * without the ones before it, under a revision that matched, so nothing
 * warned (four quick edits, one kept: found 26 Sep while checking the Money
 * reload loop). The ledger lost its queued rows the same way and wrote them
 * again and again (the loop itself, #93).
 *
 * So while writes of a kind are pending, the cached copy of that part stays,
 * with its revision. The rest of the document comes from the server. The
 * write that settles last refetches again, and nothing is pending by then.
 */
export function withPendingWrites(
  fresh: Trip | null,
  cached: Trip | undefined,
  pending: { state: boolean; ledger: boolean },
): Trip | null {
  if (!fresh || !cached || fresh.id !== cached.id || !(pending.state || pending.ledger)) return fresh
  return {
    ...fresh,
    ...(pending.state ? { state: cached.state, state_rev: cached.state_rev } : {}),
    ...(pending.ledger ? { ledger: cached.ledger, ledger_rev: cached.ledger_rev } : {}),
  }
}
