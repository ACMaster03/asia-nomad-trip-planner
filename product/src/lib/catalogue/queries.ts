import type { SupabaseClient } from '@supabase/supabase-js'
import type { CatalogueField, City, Country } from './types'

export async function fetchFields(sb: SupabaseClient): Promise<CatalogueField[]> {
  const { data, error } = await sb
    .from('catalogue_fields')
    .select('*')
    .order('field_group')
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
