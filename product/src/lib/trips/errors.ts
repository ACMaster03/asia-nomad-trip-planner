// Typed write errors, kept dependency-free so the retry policy (writeRetry.ts)
// and its node tests can import them without dragging supabase-js along.

// A write lost the optimistic-concurrency race (someone else wrote the trip
// since we last read it). Callers roll back the optimistic UI update and
// refetch. Detection is by the RPC's SQLSTATE — NEVER by comparing updated_at.
export class RevConflictError extends Error {
  constructor() {
    super('Trip was changed elsewhere — reloaded the latest version.')
    this.name = 'RevConflictError'
  }
}
export function isRevConflict(e: unknown): e is RevConflictError {
  return e instanceof RevConflictError
}
// SQLSTATE raised by public.write_state() on an expected_rev mismatch (migration 06).
export const REV_CONFLICT_CODE = 'REV01'

// The write was refused because the caller may not edit this trip. Distinct
// from RevConflictError — a conflict means "try again", this means "you can't,
// and retrying won't help".
//
// This is how a co-editor whose access is REVOKED MID-SESSION finds out: their
// tab still holds the editable UI from before the revocation, and the first save
// after it comes back 42501. Callers roll the optimistic update back (same as a
// conflict) and surface the read-only state.
export class PermissionDeniedError extends Error {
  constructor() {
    super('You no longer have permission to edit this trip.')
    this.name = 'PermissionDeniedError'
  }
}
export function isPermissionDenied(e: unknown): e is PermissionDeniedError {
  return e instanceof PermissionDeniedError
}
// SQLSTATE raised by all three write RPCs' can_edit_trip pre-check (migration
// 06 lines 307/366/406), and by Postgres itself for an RLS WITH CHECK violation.
export const PERMISSION_DENIED_CODE = '42501'
