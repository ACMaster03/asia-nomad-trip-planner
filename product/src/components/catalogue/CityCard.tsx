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
    <article className="rounded-[var(--r)] bg-sf p-4 text-tx">
      <header className="mb-3">
        <h3 className="font-serif text-lg font-semibold">{city.city}</h3>
        <p className="text-base text-tx2">
          {city.country}
          {city.region ? ` · ${city.region}` : ''}
        </p>
      </header>
      {groups.map(({ group, fields: fs }) => (
        <section key={group} className="mb-3">
          <h4 className="mb-1 text-base font-semibold uppercase tracking-[.08em] text-tx3">{group}</h4>
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
