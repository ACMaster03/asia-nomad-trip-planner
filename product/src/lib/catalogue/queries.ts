import type { SupabaseClient } from '@supabase/supabase-js'
import type { CatalogueField, City, CityLite, Country, Place, PlaceKind } from './types'

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

const CITY_LITE_COLS = 'id,country,city,region,region_name,lat,lng,daily_living_mid,accom_mid'

/**
 * TIER 2 — browse/search list. Excludes the attributes jsonb, which is ~92% of
 * a city row (102 kB -> 8.3 kB across the 46-city catalogue, and the gap only
 * widens with the world import). Anything that needs the full record fetches
 * ONE city with fetchCityDetail.
 */
export async function fetchCityList(sb: SupabaseClient): Promise<CityLite[]> {
  const { data, error } = await sb
    .from('cities')
    .select(CITY_LITE_COLS)
    .order('country')
    .order('city')
  if (error) throw error
  return (data ?? []) as CityLite[]
}

/** TIER 2 — server-side search (migration 20, pg_trgm). Never downloads the set. */
export async function searchCities(
  sb: SupabaseClient,
  q: string,
  limit = 20,
): Promise<CityLite[]> {
  const { data, error } = await sb.rpc('search_cities', { p_q: q, p_limit: limit })
  if (error) throw error
  return (data ?? []) as CityLite[]
}

/** The full record for ONE city, including attributes — fetched on demand. */
export async function fetchCityDetail(sb: SupabaseClient, id: number): Promise<City | null> {
  const { data, error } = await sb.from('cities').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as City) ?? null
}

/**
 * TIER 1 — the trip's own cities, WITH attributes, because the budget needs
 * costs.accomPerNight / costs.dailyLiving (buildCityIndex). Scoped to the route,
 * so this stays small and precacheable however big the catalogue grows.
 */
export async function fetchCitiesByName(
  sb: SupabaseClient,
  names: string[],
): Promise<City[]> {
  const wanted = [...new Set(names.filter(Boolean))]
  if (wanted.length === 0) return []
  const { data, error } = await sb.from('cities').select('*').in('city', wanted)
  if (error) throw error
  return (data ?? []) as City[]
}

export async function fetchCountries(sb: SupabaseClient): Promise<Country[]> {
  const { data, error } = await sb.from('countries').select('*')
  if (error) throw error
  return (data ?? []) as Country[]
}

const PLACE_COLS = 'id,city_id,name,kind,lat,lng,source,attributes'

// Places for one city (the /live check-in picker). Catalogue places match by
// city_id; user places in NON-catalogue cities (e.g. a home-country stop —
// dogfood 2026-07-24) match by the stored city NAME (migration 14). No GPS
// yet, so the stable alphabetical order doubles as the "location denied"
// fallback from the mock.
export async function fetchPlaces(
  sb: SupabaseClient,
  city: { cityId: number | null; cityName: string },
): Promise<Place[]> {
  let q = sb.from('places').select(PLACE_COLS)
  if (city.cityId != null) {
    // PostgREST or(): values with commas would break the filter — city names
    // don't contain them (both writes and reads use the segment's city string).
    q = q.or(`city_id.eq.${city.cityId},and(city_id.is.null,city_name.eq.${city.cityName})`)
  } else {
    q = q.is('city_id', null).eq('city_name', city.cityName)
  }
  const { data, error } = await q.order('name')
  if (error) throw error
  return (data ?? []) as Place[]
}

// "Add a place here": RLS (migration 09) only accepts source='user' rows
// attributed to the caller. cityName keeps the place findable on the NEXT
// check-in even when the city has no catalogue row (cityId null).
export async function insertUserPlace(
  sb: SupabaseClient,
  input: { cityId: number | null; cityName: string; name: string; kind: PlaceKind },
): Promise<Place> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  const { data, error } = await sb
    .from('places')
    .insert({
      city_id: input.cityId,
      city_name: input.cityName.trim(),
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
