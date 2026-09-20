import type { CatalogueField, City, Country } from '@/lib/catalogue/types'
import { getAtJsonPath } from '@/lib/catalogue/getAtJsonPath'
import { MONTHS } from '@/lib/map/globeData'
import { FieldRenderer } from './FieldRenderer'

// A catalogue city, read the way someone choosing where to work next month
// reads it. It used to be every field the catalogue holds, in DB order, as a
// two-column definition list: correct, complete, and no help at all deciding
// between two cities. Landmarks were the worst of it, six labelled values run
// together on one line each.
//
// So: a summary of the four things that decide it (what a day costs, whether
// you can work, what the weather does THIS month, what to watch out for),
// then landmarks as one card each, then everything else behind <details>.
// Native disclosure, no state, no JS, and it prints and searches open.
//
// The summary reads the same jsonb paths and columns the catalogue_fields rows
// name (migration 03), so PROMOTED below hides the duplicates further down. A
// key that ever stops matching costs a repeat, never a blank screen.
const PROMOTED = new Set([
  'city', 'country', 'region', 'region_name', // already in the header
  'daily_living_mid', 'accom_mid', 'rent_monthly', // the cost line
  'internet', // the work line
  'weather', // the month line and the caution
  'landmarks', // its own cards below
])

interface Landmark { name?: string; why?: string; when?: string; how?: string; cost?: string; time?: string }
interface MonthNormal { m?: string; hi?: number; lo?: number; rain?: number }

// Same threshold the globe uses to call a month a hazard (globeData
// seasonalHazards), so the two screens never disagree about a wet September.
const WET_MM = 250

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
  const monthIdx = new Date().getMonth()

  const internet = str(getAtJsonPath(city.attributes, 'internet'))
  const caution = str(getAtJsonPath(city.attributes, 'weather.hazard'))
  const months = getAtJsonPath(city.attributes, 'weather.months')
  const month: MonthNormal | undefined = Array.isArray(months) ? months[monthIdx] : undefined
  const landmarks: Landmark[] = Array.isArray(getAtJsonPath(city.attributes, 'landmarks'))
    ? (getAtJsonPath(city.attributes, 'landmarks') as Landmark[])
    : []

  const costBits = [
    city.daily_living_mid != null ? `$${city.daily_living_mid}/day to live` : null,
    city.accom_mid != null ? `$${city.accom_mid}/night mid-range` : null,
    city.rent_monthly != null ? `$${city.rent_monthly}/month for a furnished 1-bed` : null,
  ].filter(Boolean) as string[]

  // group by field_group, preserving the DB sort order
  const groups: { group: string; fields: CatalogueField[] }[] = []
  for (const f of fields) {
    if (PROMOTED.has(f.key)) continue
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
          {city.region_name ? ` · ${city.region_name}` : city.region ? ` · ${city.region}` : ''}
        </p>
      </header>

      <dl className="flex flex-col gap-2.5">
        {costBits.length > 0 && (
          <Summary term="Costs">
            {costBits.join(' · ')}
            <span className="block text-tx2">
              Living is food, local transport and activities for two, without a bed. Mid-2026
              estimates in US dollars.
            </span>
          </Summary>
        )}
        {internet && <Summary term="Working">{internet}</Summary>}
        {month && (
          <Summary term={`${MONTHS[monthIdx]} weather`}>
            {[
              month.hi != null && month.lo != null ? `${month.hi}° by day, ${month.lo}° at night` : null,
              month.rain != null ? `${month.rain}mm of rain` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {month.rain != null && month.rain >= WET_MM && (
              <span className="block font-medium text-warn">
                Well into the wet season. This is the same month the map marks as a hazard.
              </span>
            )}
            <span className="block text-tx2">A climate average for the month, not a forecast.</span>
          </Summary>
        )}
        {caution && <Summary term="Worth knowing">{caution}</Summary>}
      </dl>

      {landmarks.length > 0 && (
        <section className="mt-4">
          <h4 className="mb-2 text-base font-semibold uppercase tracking-[.08em] text-tx3">
            Landmarks
          </h4>
          <ul className="flex flex-col gap-2">
            {landmarks.map((l, i) => {
              const meta = [l.when, l.cost, l.time].filter(Boolean).join(' · ')
              return (
                <li key={l.name ?? i} className="rounded-[calc(var(--r)-6px)] bg-fill p-3">
                  <p className="text-base font-semibold">{l.name ?? 'Unnamed'}</p>
                  {l.why && <p className="mt-0.5 text-base text-tx2">{l.why}</p>}
                  {meta && <p className="mt-1 text-base text-tx2">{meta}</p>}
                  {l.how && <p className="mt-0.5 text-base text-tx3">Getting there: {l.how}</p>}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {groups.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5">
          {groups.map(({ group, fields: fs }) => (
            <details key={group} className="rounded-[calc(var(--r)-6px)] bg-fill px-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center text-base font-semibold text-tx2 [&::-webkit-details-marker]:hidden">
                {group}
                <span aria-hidden className="ml-auto text-tx3">
                  +
                </span>
              </summary>
              <dl className="grid grid-cols-2 gap-2 pb-3">
                {fs.map((f) => (
                  <FieldRenderer key={f.key} field={f} city={city} country={country} />
                ))}
              </dl>
            </details>
          ))}
        </div>
      )}
    </article>
  )
}

function Summary({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-base uppercase tracking-wide text-tx3">{term}</dt>
      <dd className="text-base leading-normal">{children}</dd>
    </div>
  )
}

const str = (v: unknown): string => (typeof v === 'string' && v.trim() ? v : '')
