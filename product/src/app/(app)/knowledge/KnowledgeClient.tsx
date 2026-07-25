'use client'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchFields,
  fetchCityList,
  fetchCityDetail,
  fetchCountries,
  searchCities,
  searchPlaces,
} from '@/lib/catalogue/queries'
import { qk } from '@/lib/catalogue/keys'
import { useOnline } from '@/lib/useOnline'
import { countryFlag } from '@/lib/catalogue/countryCurrencies'
import { CityCard } from '@/components/catalogue/CityCard'
import type { CityLite, Country, PlaceHit } from '@/lib/catalogue/types'

// Approved endframe: mock 08. This is THE Tier-2 screen — the world catalogue
// is searched on the SERVER and never downloaded (migrations 20/21).
//
// It used to fetch every city WITH its attributes blob and filter client-side:
// ~102 kB across 46 cities, and unusable at 10 000. Browsing now uses the light
// list (~8 kB, no attributes) and the fat record is fetched for ONE city when
// it is opened.

const MIN_QUERY = 2

export default function KnowledgeClient() {
  const sb = createClient()
  const online = useOnline()

  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [openCity, setOpenCity] = useState<number | null>(null)

  // Debounced: every keystroke is a round trip, so the input stays responsive
  // while the list lags slightly behind (mock 08).
  useEffect(() => {
    const t = setTimeout(() => setQ(term.trim()), 250)
    return () => clearTimeout(t)
  }, [term])

  const { data: fields = [] } = useQuery({ queryKey: qk.fields, queryFn: () => fetchFields(sb) })
  const { data: countries = [] } = useQuery({
    queryKey: qk.countries,
    queryFn: () => fetchCountries(sb),
  })
  const { data: cityList = [] } = useQuery({
    queryKey: qk.citiesLite,
    queryFn: () => fetchCityList(sb),
    staleTime: 6 * 60 * 60_000,
  })

  const searching = q.length >= MIN_QUERY
  const cityHits = useQuery({
    queryKey: ['city-search', q],
    queryFn: () => searchCities(sb, q, 20),
    enabled: online && searching,
    staleTime: 5 * 60_000,
  })
  const placeHits = useQuery({
    queryKey: ['place-search', q],
    queryFn: () => searchPlaces(sb, q, 20),
    enabled: online && searching,
    staleTime: 5 * 60_000,
  })
  const detail = useQuery({
    queryKey: ['city-detail', openCity],
    queryFn: () => fetchCityDetail(sb, openCity as number),
    enabled: openCity !== null,
  })

  const countriesByCode = useMemo(
    () => Object.fromEntries(countries.map((c) => [c.code, c])) as Record<string, Country>,
    [countries],
  )
  const countryNames = useMemo(
    () => [...new Set(cityList.map((c) => c.country).filter(Boolean))].sort(),
    [cityList],
  )
  const browse = country ? cityList.filter((c) => c.country === country) : []

  // Tier 2 needs signal, and says so rather than looking broken. Trip cities are
  // Tier 1 and stay readable on the trip screens (mock 08 "Offline").
  if (!online) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-1 text-2xl font-semibold">Explore</h1>
        <div className="mt-10 text-center">
          <div className="text-4xl">📴</div>
          <h2 className="mt-3 text-lg font-semibold">Explore needs a connection</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
            The world catalogue lives on the server — it’s far too big to keep on your phone. Your
            own trip works fully offline: stops, stays, budget, check-ins and your saved notes are
            all still there.
          </p>
          <a
            href="/live"
            className="mt-4 inline-block rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white"
          >
            Go to Today →
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Explore</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {`Country & city knowledge base — ${fields.length} fields, rendered dynamically from the catalogue.`}
      </p>

      <input
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          setOpenCity(null)
        }}
        placeholder="🔍 Search cities or places… e.g. “Bangkok”, “Wat Pho”"
        className="mb-4 w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />

      {searching ? (
        <SearchResults
          loading={cityHits.isPending || placeHits.isPending}
          cities={cityHits.data ?? []}
          places={placeHits.data ?? []}
          q={q}
          onOpen={setOpenCity}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {countryNames.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCountry(country === c ? '' : c)
                  setOpenCity(null)
                }}
                className={`rounded border px-3 py-1 text-sm ${
                  country === c
                    ? 'border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-400'
                    : 'border-neutral-300 dark:border-neutral-700'
                }`}
              >
                {countryFlag(c)} {c}
              </button>
            ))}
          </div>
          {country ? (
            <CityRows cities={browse} onOpen={setOpenCity} />
          ) : (
            <p className="mt-10 text-center text-sm text-neutral-500">
              Pick a country above, or search for a city or place.
            </p>
          )}
        </>
      )}

      {openCity !== null && (
        <div className="mt-6">
          {detail.isPending && <p className="text-sm text-neutral-500">Loading…</p>}
          {detail.data && (
            <CityCard city={detail.data} fields={fields} countriesByCode={countriesByCode} />
          )}
        </div>
      )}
    </main>
  )
}

function CityRows({ cities, onOpen }: { cities: CityLite[]; onOpen: (id: number) => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      {cities.map((c) => (
        <button
          key={c.id}
          onClick={() => onOpen(c.id)}
          className="flex w-full items-center gap-3 border-b border-neutral-100 px-3 py-2.5 text-left last:border-0 hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900"
        >
          <span>{countryFlag(c.country)}</span>
          <span className="flex-1">
            <span className="text-sm font-medium">{c.city}</span>
            <span className="block text-xs text-neutral-500">
              {[c.country, c.region_name].filter(Boolean).join(' · ')}
            </span>
          </span>
          {c.daily_living_mid != null && (
            <span className="text-xs text-neutral-500">${c.daily_living_mid}/day</span>
          )}
        </button>
      ))}
    </div>
  )
}

function SearchResults({
  loading,
  cities,
  places,
  q,
  onOpen,
}: {
  loading: boolean
  cities: CityLite[]
  places: PlaceHit[]
  q: string
  onOpen: (id: number) => void
}) {
  const total = cities.length + places.length
  if (loading) return <p className="text-sm text-neutral-500">Searching…</p>

  // Says what the catalogue DOES cover, so a miss reads as a gap in the data
  // rather than a broken search (mock 08 "No results").
  if (total === 0) {
    return (
      <div className="mt-10 text-center">
        <div className="text-4xl">🔍</div>
        <h2 className="mt-3 text-lg font-semibold">{`Nothing matches “${q}”`}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
          The catalogue grows as the trip does — and you can still add a stop anywhere, catalogued
          or not.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Count shown so the server-side cap never silently hides matches. */}
      <p className="mb-3 text-xs text-neutral-500">
        {`Showing ${total} match${total === 1 ? '' : 'es'} · searched on the server`}
      </p>
      {cities.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold">Cities</h2>
          <div className="mb-4">
            <CityRows cities={cities} onOpen={onOpen} />
          </div>
        </>
      )}
      {places.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold">Places</h2>
          <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
            {places.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 border-b border-neutral-100 px-3 py-2.5 last:border-0 dark:border-neutral-900"
              >
                <span>📍</span>
                <span className="flex-1">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-neutral-500">
                    {[p.city_name, p.kind].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
