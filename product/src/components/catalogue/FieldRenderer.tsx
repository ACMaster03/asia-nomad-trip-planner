import type { CatalogueField, City, Country } from '@/lib/catalogue/types'
import { getAtJsonPath } from '@/lib/catalogue/getAtJsonPath'
import { TextField, NumberField, RangeField, ListField, ObjectField } from './renderers'
import type { FC } from 'react'

export interface RendererProps {
  value: unknown
  field: CatalogueField
}

const REGISTRY: Record<string, FC<RendererProps>> = {
  text: TextField,
  number: NumberField,
  range: RangeField,
  list: ListField,
  object: ObjectField,
}

// Where to read the value from is data-driven (field.source), so column- and
// country-sourced fields render too — not just jsonb attributes.
function readValue(field: CatalogueField, city: City, country: Country | undefined): unknown {
  switch (field.source) {
    case 'column':
      return (city as unknown as Record<string, unknown>)[field.key]
    case 'country':
      return country ? (country as unknown as Record<string, unknown>)[field.key] : undefined
    case 'attribute':
    default:
      return getAtJsonPath(city.attributes, field.key) // supports dotted keys e.g. costs.dailyLiving
  }
}

export function FieldRenderer({
  field,
  city,
  country,
}: {
  field: CatalogueField
  city: City
  country: Country | undefined
}) {
  const value = readValue(field, city, country)
  if (value == null || value === '') return null // missing on this city → render nothing
  const Cmp = REGISTRY[field.type] ?? TextField // unknown type degrades to text, never crashes
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{field.label}</dt>
      <dd className="text-sm">
        <Cmp value={value} field={field} />
      </dd>
    </div>
  )
}
