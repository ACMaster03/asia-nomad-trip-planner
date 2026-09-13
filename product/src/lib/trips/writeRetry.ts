import type { SupabaseClient } from '@supabase/supabase-js'
import { isRevConflict, isPermissionDenied } from './errors.ts'

// Retry policy for trip/ledger writes (owner note, 2026-09-11: "when adding
// financial entries it often gets the error 'couldn't save my changes' and I
// have to add it again — also at accommodations").
//
// Both symptoms fit a phone that just came back from the background: the
// first request after a resume can go out on a connection iOS has already
// torn down ("Load failed"), or with an access token that expired while the
// app slept (PostgREST answers 401 / PGRST301 before supabase-js has refreshed
// it). Neither is the user's fault and both succeed a second later — so the
// mutation retries a couple of times with a short backoff instead of showing
// the amber banner. The two errors that are NOT transient stay un-retried: a
// revision conflict needs a fresh document, a permission failure never heals.

export const WRITE_RETRIES = 2

export function shouldRetryWrite(failureCount: number, error: unknown): boolean {
  if (isRevConflict(error) || isPermissionDenied(error)) return false
  return failureCount < WRITE_RETRIES
}

export const writeRetryDelay = (attempt: number) => Math.min(700 * 2 ** attempt, 3000)

// PostgREST's "JWT expired" (PGRST301) and Supabase's generic 401 both surface
// as PostgrestError-shaped objects with these fields.
export function isExpiredToken(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const { code, message, status } = e as { code?: string; message?: string; status?: number }
  return code === 'PGRST301' || status === 401 || /jwt expired/i.test(message ?? '')
}

/**
 * Run a write; if it fails because the session token went stale, refresh the
 * session once and run it again. Anything else propagates to the mutation's
 * retry policy above.
 */
export async function withFreshSession<T>(sb: SupabaseClient, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (!isExpiredToken(e)) throw e
    await sb.auth.refreshSession().catch(() => undefined)
    return run()
  }
}
