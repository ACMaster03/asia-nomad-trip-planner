import type { SupabaseClient } from '@supabase/supabase-js'
import type { Trip, Ledger, LedgerEntry, TripState } from './types'
import { makeDefaultState } from './defaultState'

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

// Active trip = the most recently updated RLS-visible trip. null → empty/create state.
export async function fetchActiveTrip(sb: SupabaseClient): Promise<Trip | null> {
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
export async function createTrip(sb: SupabaseClient): Promise<Trip> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user!.id
  const seed = makeDefaultState()
  const { data, error } = await sb
    .from('trips')
    .insert({ owner: uid, name: seed.meta.tripName, state: seed, ledger: [] })
    .select(TRIP_COLS)
    .single()
  if (error) throw error
  return data as Trip
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
  if (error) throw error
  return data as number
}

export async function ledgerDeleteEntry(sb: SupabaseClient, tripId: string, entryId: string): Promise<number> {
  const { data, error } = await sb.rpc('ledger_delete_entry', { trip: tripId, entry_id: entryId })
  if (error) throw error
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
