import type { SupabaseClient } from '@supabase/supabase-js'
import type { CatalogueField, City, Country, Place, PlaceKind } from './types'

export async function fetchFields(sb: SupabaseClient): Promise<CatalogueField[]> {
  // order by sort_order only: the seed assigns contiguous ranges per group
  // (Overview 10s, Map 20s, Costs 30s, …), so groups come out in intended order
  // AND stay contiguous for arrival-order grouping in CityCard.
  const { data, error } = await sb
    .from('catalogue_fields')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return data as CatalogueField[]
}

export async function fetchCities(sb: SupabaseClient): Promise<City[]> {
  const { data, error } = await sb
    .from('cities')
    .select(
      'id,country,city,region,region_name,lat,lng,daily_living_mid,accom_mid,rent_monthly,attributes',
    )
    .order('country')
    .order('city')
  if (error) throw error
  return data as City[]
}

export async function fetchCountries(sb: SupabaseClient): Promise<Country[]> {
  const { data, error } = await sb.from('countries').select('*')
  if (error) throw error
  return (data ?? []) as Country[]
}

const PLACE_COLS = 'id,city_id,name,kind,lat,lng,source,attributes'

// Places for one city (the /live check-in picker). No GPS yet, so the stable
// alphabetical order doubles as the "location denied" fallback from the mock.
export async function fetchPlaces(sb: SupabaseClient, cityId: number): Promise<Place[]> {
  const { data, error } = await sb
    .from('places')
    .select(PLACE_COLS)
    .eq('city_id', cityId)
    .order('name')
  if (error) throw error
  return (data ?? []) as Place[]
}

// "Add a place here": RLS (migration 09) only accepts source='user' rows
// attributed to the caller. cityId may be null when the current city isn't in
// the catalogue (a gap stop) — the place still works as a check-in target.
export async function insertUserPlace(
  sb: SupabaseClient,
  input: { cityId: number | null; name: string; kind: PlaceKind },
): Promise<Place> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  const { data, error } = await sb
    .from('places')
    .insert({
      city_id: input.cityId,
      name: input.name.trim(),
      kind: input.kind,
      source: 'user',
      created_by: uid,
    })
    .select(PLACE_COLS)
    .single()
  if (error) throw error
  return data as Place
}
