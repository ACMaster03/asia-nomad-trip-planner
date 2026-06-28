import type { SupabaseClient } from '@supabase/supabase-js'
import type { Trip, Ledger, TripState } from './types'
import { makeDefaultState } from './defaultState'

const TRIP_COLS = 'id,owner,name,state,ledger,updated_at,created_at'

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

// Money edit: write ONLY the `ledger` column (+ updated_at) — keeps ledger edits
// independent of `state` edits so the two columns never clobber each other.
export async function writeLedger(sb: SupabaseClient, tripId: string, ledger: Ledger): Promise<void> {
  const { error } = await sb
    .from('trips')
    .update({ ledger, updated_at: new Date().toISOString() })
    .eq('id', tripId)
  if (error) throw error
}

// Itinerary/settings edit: write ONLY the `state` column (+ name + updated_at).
// Both this app and the static app write the whole `state` document, so the
// semantics are last-write-wins per the `state` column (same as the static app
// across two browsers). `ledger` is never touched here.
export async function writeState(sb: SupabaseClient, tripId: string, state: TripState): Promise<void> {
  const { error } = await sb
    .from('trips')
    .update({ state, name: state.meta?.tripName ?? 'Trip', updated_at: new Date().toISOString() })
    .eq('id', tripId)
  if (error) throw error
}
