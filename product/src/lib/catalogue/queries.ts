import type { SupabaseClient } from '@supabase/supabase-js'
import type { CatalogueField, City, Country } from './types'

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
