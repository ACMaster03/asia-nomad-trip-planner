export type FieldType = 'text' | 'number' | 'range' | 'list' | 'object'
export type FieldSource = 'attribute' | 'column' | 'country'

export interface ItemField {
  key: string
  label: string
  type?: FieldType
  unit?: string | null
  item_fields?: ItemField[]
}

export interface CatalogueField {
  key: string
  label: string
  field_group: string
  type: FieldType
  source: FieldSource
  unit: string | null
  sort_order: number
  show_in_list: boolean
  item_fields: ItemField[] | null
}

/**
 * A city WITHOUT its attributes blob — the Tier-2 shape (migration 20).
 * attributes is ~92% of a city row, and a browse/search list never renders it.
 */
export interface CityLite {
  id: number
  country: string
  city: string
  region: string | null
  region_name: string | null
  lat: number | null
  lng: number | null
  daily_living_mid: number | null
  accom_mid: number | null
}

export interface City {
  id: number
  country: string
  city: string
  region: string | null
  region_name: string | null
  lat: number | null
  lng: number | null
  daily_living_mid: number | null
  accom_mid: number | null
  rent_monthly: number | null
  attributes: Record<string, unknown> // opaque on purpose — never type each field
}

// places table (migration 09) — the check-in targets. World data like cities:
// any signed-in user reads all; users may add source='user' rows attributed to
// themselves ("Add a place here" in /live).
export type PlaceKind =
  | 'landmark' | 'restaurant' | 'cafe' | 'activity' | 'stay' | 'transporthub' | 'other'

export interface Place {
  id: string
  city_id: number | null
  name: string
  kind: PlaceKind
  lat: number | null // often NULL (ungeocoded) — fall back to the city's coords
  lng: number | null
  source: 'catalogue' | 'user'
  attributes: Record<string, unknown> // {why,how,cost,time,when,...} — opaque
}

export interface Country {
  code: string
  name: string
  iso2: string | null
  currency: string | null
  visa: string | null
  best_time: string | null
  safety: string | null
  extras: Record<string, unknown>
}
