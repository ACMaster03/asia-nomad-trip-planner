import type { SupabaseClient } from '@supabase/supabase-js'

// The people who travel on a journey, by first name (migration 47,
// trip_travellers): the owner and the editors, for anyone who can view the
// journey. Home's Latest names a co-traveller's check-in with it (Petra,
// 12 Oct 2026); before, every row by someone else said "A co-traveller".

export interface TripTraveller {
  id: string
  /** first name from the account, or "A traveller" */
  name: string
  isOwner: boolean
}

export async function fetchTripTravellers(sb: SupabaseClient, tripId: string): Promise<TripTraveller[]> {
  const { data, error } = await sb.rpc('trip_travellers', { p_trip: tripId })
  if (error) throw error
  return (data as TripTraveller[] | null) ?? []
}
