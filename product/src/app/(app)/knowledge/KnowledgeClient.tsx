'use client'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchFields, fetchCities, fetchCountries } from '@/lib/catalogue/queries'
import { qk } from '@/lib/catalogue/keys'
import { CityCard } from '@/components/catalogue/CityCard'
import type { Country } from '@/lib/catalogue/types'

export default function KnowledgeClient() {
  const sb = createClient()
  const { data: fields = [] } = useQuery({ queryKey: qk.fields, queryFn: () => fetchFields(sb) })
  const { data: cities = [] } = useQuery({ queryKey: qk.cities, queryFn: () => fetchCities(sb) })
  const { data: countries = [] } = useQuery({ queryKey: qk.countries, queryFn: () => fetchCountries(sb) })

  const countriesByCode = useMemo(
    () => Object.fromEntries(countries.map((c) => [c.code, c])) as Record<string, Country>,
    [countries],
  )

  const [region, setRegion] = useState<string>('')
  const regions = useMemo(
    () => [...new Set(cities.map((c) => c.region).filter(Boolean))] as string[],
    [cities],
  )
  const shown = region ? cities.filter((c) => c.region === region) : cities

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Knowledge base</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {cities.length} cities · {fields.length} fields · rendered dynamically from the catalogue.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setRegion('')}
          className={`rounded border px-3 py-1 text-sm ${region === '' ? 'bg-neutral-200 dark:bg-neutral-800' : ''}`}
        >
          All
        </button>
        {regions.map((r) => (
          <button
            key={r}
            onClick={() => setRegion(r)}
            className={`rounded border px-3 py-1 text-sm ${region === r ? 'bg-neutral-200 dark:bg-neutral-800' : ''}`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {shown.map((c) => (
          <CityCard key={c.id} city={c} fields={fields} countriesByCode={countriesByCode} />
        ))}
      </div>
    </main>
  )
}
