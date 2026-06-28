import type { CatalogueField, City, Country } from '@/lib/catalogue/types'
import { FieldRenderer } from './FieldRenderer'

export function CityCard({
  city,
  fields,
  countriesByCode,
}: {
  city: City
  fields: CatalogueField[]
  countriesByCode: Record<string, Country>
}) {
  const country = countriesByCode[city.country]

  // group by field_group, preserving the DB sort order
  const groups: { group: string; fields: CatalogueField[] }[] = []
  for (const f of fields) {
    const g = f.field_group ?? 'Other'
    let bucket = groups.find((x) => x.group === g)
    if (!bucket) {
      bucket = { group: g, fields: [] }
      groups.push(bucket)
    }
    bucket.fields.push(f)
  }

  return (
    <article className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <header className="mb-3">
        <h3 className="text-lg font-semibold">{city.city}</h3>
        <p className="text-sm text-neutral-500">
          {city.country}
          {city.region ? ` · ${city.region}` : ''}
        </p>
      </header>
      {groups.map(({ group, fields: fs }) => (
        <section key={group} className="mb-3">
          <h4 className="mb-1 text-xs font-bold text-neutral-400">{group}</h4>
          <dl className="grid grid-cols-2 gap-2">
            {fs.map((f) => (
              <FieldRenderer key={f.key} field={f} city={city} country={country} />
            ))}
          </dl>
        </section>
      ))}
    </article>
  )
}
