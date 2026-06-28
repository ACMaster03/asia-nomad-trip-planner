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
