import type { SupabaseClient } from '@supabase/supabase-js'
import type { Trip, Ledger, LedgerEntry, TripState } from './types'
import { makeNewTripState, type NewTripInput } from './newTrip'

// select('*') on purpose: the rev columns (state_rev/ledger_rev) only exist once
// supabase/migrations/06-security.sql is applied. '*' works on both schemas —
// pre-migration the fields are simply undefined on the row, which is exactly the
// signal the write paths use to fall back to legacy direct updates.
// TODO(migration-06): switch back to an explicit column list incl. state_rev,
// ledger_rev once 06 is applied everywhere.
const TRIP_COLS = '*'

// Typed conflict error: a write lost the optimistic-concurrency race (someone
// else wrote the trip since we last read it). Callers roll back the optimistic
// UI update and refetch. Detection is by the RPC's SQLSTATE — NEVER by
// comparing updated_at.
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
const REV_CONFLICT_CODE = 'REV01'

// Typed permission error: the write was refused because the caller may not edit
// this trip. Distinct from RevConflictError — a conflict means "try again", this
// means "you can't, and retrying won't help".
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
const PERMISSION_DENIED_CODE = '42501'

// One trip by id. null → not visible (RLS) or deleted; callers fall back.
export async function fetchTrip(sb: SupabaseClient, id: string): Promise<Trip | null> {
  const { data, error } = await sb.from('trips').select(TRIP_COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Trip | null) ?? null
}

// Lightweight list for the Settings switcher — no state/ledger payloads.
export type TripListItem = { id: string; name: string; owner: string; updated_at: string; created_at: string }
export async function fetchTrips(sb: SupabaseClient): Promise<TripListItem[]> {
  const { data, error } = await sb
    .from('trips')
    .select('id,name,owner,updated_at,created_at')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as TripListItem[]) ?? []
}

// The user's per-ACCOUNT trip selection (profiles.active_trip_id, migration 07):
// phone and laptop always show the same trip. select('*') keeps working on a
// pre-migration-07 DB — the field is just undefined → callers fall back.
// TODO(migration-07): switch to an explicit column list once 07 is applied.
async function fetchSelectedTripId(sb: SupabaseClient): Promise<string | null> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null
  const { data, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle()
  if (error) throw error
  return (data as { active_trip_id?: string | null } | null)?.active_trip_id ?? null
}

// Persist the selection. Errors are surfaced (the 07 guard trigger refuses
// trips the user cannot see). No-ops harmlessly on a pre-migration-07 DB?
// No — updating a missing column errors; callers only invoke this from the
// switcher UI, which is only reachable when a selection exists (post-07) or
// degrades to a local-only switch via the catch in SettingsClient.
export async function setSelectedTripId(sb: SupabaseClient, tripId: string): Promise<void> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  const { error } = await sb.from('profiles').update({ active_trip_id: tripId }).eq('id', uid)
  if (error) throw error
}

// Resolve the working trip: profile selection first; if unset, invisible or
// pre-migration-07, fall back to the newest RLS-visible trip (the pre-multi-trip
// behaviour). null → user has no trips at all → empty/create state.
export async function resolveActiveTrip(sb: SupabaseClient): Promise<Trip | null> {
  const selectedId = await fetchSelectedTripId(sb).catch(() => null)
  if (selectedId) {
    const selected = await fetchTrip(sb, selectedId)
    if (selected) return selected
  }
  const { data, error } = await sb
    .from('trips')
    .select(TRIP_COLS)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false }) // stable tiebreaker when updated_at ties
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as Trip | null) ?? null
}

// CREATE-TRIP: owner=auth.uid() satisfies trips_insert. Insert ONLY owner/name/
// state/ledger — the document model is the single source of truth; the scalar
// columns (travelers, rates, …) live inside `state` and must not be duplicated.
// Seeds from the wizard's inputs via makeNewTripState — never from the owner's
// real trip data (the old makeDefaultState seed leaked booking confirmations).
//
// IDEMPOTENCY (same pattern as the outbox, lib/trips/outbox.ts): the caller
// passes a client-generated `id` that is stable for the whole create attempt
// (one per wizard mount). If the insert fires twice — double-fired submit, a
// retry after a lost response, an auth-event replay — the second insert hits
// the primary key, Postgres answers 23505, and we resolve to the row that is
// already there instead of creating a sibling. One submit → exactly one trip.
// (The July 2026 "four identical trips" incident was the legacy static app's
// seed-on-empty race — js/cloud.js, since made read-only — but the guarantee
// belongs on this path too: creating a trip is the first thing every new
// account does.)
export async function createTrip(sb: SupabaseClient, input: NewTripInput, id?: string): Promise<Trip> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user!.id
  const seed = makeNewTripState(input)
  const { data, error } = await sb
    .from('trips')
    .insert({ ...(id ? { id } : {}), owner: uid, name: seed.meta.tripName, state: seed, ledger: [] })
    .select(TRIP_COLS)
    .single()
  if (error) {
    if (id && error.code === '23505') {
      // duplicate key on our own id = this create already landed → return it
      const existing = await fetchTrip(sb, id)
      if (existing) return existing
    }
    throw error
  }
  return data as Trip
}

// Wizard step 3 / Settings sharing: record a co-editor invite. The invitee gets
// access by signing in with this email and accepting (RLS from migrations 02+06
// lets them join ONLY with the invited role). Acceptance UI in the product app
// lands with M3's sharing panel.
export async function createInvite(sb: SupabaseClient, tripId: string, email: string, role: 'editor' | 'viewer' = 'editor'): Promise<void> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  const { error } = await sb
    .from('trip_invites')
    .insert({ trip_id: tripId, email: email.trim().toLowerCase(), role, invited_by: uid })
  if (error) throw error
}

// Itinerary/settings edit: writes ONLY the `state` column (+ name) through the
// write_state RPC, guarded by expected_rev — if someone else wrote `state`
// since we read revision `expectedRev`, the DB refuses with SQLSTATE REV01 and
// we throw RevConflictError instead of silently clobbering their edit.
// Returns the new state_rev so the caller can keep its cache in sync between
// serialized writes (the refetch may not have landed yet).
//
// LEGACY FALLBACK: expectedRev === undefined means the trip row had no
// state_rev column, i.e. migration 06 is not applied to this database yet.
// In that case use the old direct last-write-wins update so the app keeps
// working. TODO(migration-06): drop this fallback (and the parameter's
// undefined case) once 06-security.sql is applied in prod.
export async function writeState(
  sb: SupabaseClient,
  tripId: string,
  state: TripState,
  expectedRev?: number,
): Promise<number | undefined> {
  const name = state.meta?.tripName ?? 'Trip'
  if (expectedRev === undefined) {
    // LEGACY path only. Note it cannot detect a permission failure: a viewer's
    // UPDATE simply matches zero rows under RLS and reports success. That's one
    // more reason this fallback dies with the migration-06 rollout.
    const { error } = await sb
      .from('trips')
      .update({ state, name, updated_at: new Date().toISOString() })
      .eq('id', tripId)
    if (error) throw error
    return undefined
  }
  const { data, error } = await sb.rpc('write_state', {
    trip: tripId,
    new_state: state,
    new_name: name,
    expected_rev: expectedRev,
  })
  if (error) {
    if (error.code === REV_CONFLICT_CODE) throw new RevConflictError()
    if (error.code === PERMISSION_DENIED_CODE) throw new PermissionDeniedError()
    throw error
  }
  return data as number
}

// Money edits go through per-entry merge RPCs (migration 06): each call
// appends/replaces/removes exactly ONE entry by its id inside trips.ledger in a
// single SQL statement, so two devices adding entries at the same time can no
// longer wipe each other's rows. Both return the new ledger_rev.
export async function ledgerUpsertEntry(sb: SupabaseClient, tripId: string, entry: LedgerEntry): Promise<number> {
  const { data, error } = await sb.rpc('ledger_upsert_entry', { trip: tripId, entry })
  if (error) {
    if (error.code === PERMISSION_DENIED_CODE) throw new PermissionDeniedError()
    throw error
  }
  return data as number
}

export async function ledgerDeleteEntry(sb: SupabaseClient, tripId: string, entryId: string): Promise<number> {
  const { data, error } = await sb.rpc('ledger_delete_entry', { trip: tripId, entry_id: entryId })
  if (error) {
    if (error.code === PERMISSION_DENIED_CODE) throw new PermissionDeniedError()
    throw error
  }
  return data as number
}

// LEGACY whole-array ledger write — pre-migration-06 databases only (no
// ledger_rev column → no RPCs either). Last-write-wins across devices.
// TODO(migration-06): drop once 06-security.sql is applied in prod.
export async function writeLedger(sb: SupabaseClient, tripId: string, ledger: Ledger): Promise<void> {
  const { error } = await sb
    .from('trips')
    .update({ ledger, updated_at: new Date().toISOString() })
    .eq('id', tripId)
  if (error) throw error
}
