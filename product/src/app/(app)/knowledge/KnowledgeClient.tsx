'use client'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, MapPin, Search, WifiOff } from 'lucide-react'
import Link from 'next/link'
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
import { countryFlag } from '@/lib/catalogue/countryCurrencies'
import { CityCard } from '@/components/catalogue/CityCard'
import type { CityLite, Country, PlaceHit } from '@/lib/catalogue/types'

// Handoff frames 20–22: Explore is no longer a destination (nav 1g) — it is
// Map's search, opened from the globe's top-right icon. This is THE Tier-2
// screen — the world catalogue is searched on the SERVER and never downloaded
// (migrations 20/21).
//
// It used to fetch every city WITH its attributes blob and filter client-side:
// ~102 kB across 46 cities, and unusable at 10 000. Browsing now uses the light
// list (~8 kB, no attributes) and the fat record is fetched for ONE city when
// it is opened.

const MIN_QUERY = 2

const rowCls = 'flex w-full items-center gap-[11px] border-b border-ln px-3.5 py-[13px] text-left last:border-0'

export default function KnowledgeClient() {
  const sb = createClient()
  // Online-only gate (frame 22) — useSyncExternalStore so the SSR snapshot
  // stays "online" and a cold load never flashes the offline notice.
  const online = useSyncExternalStore(subscribeOnline, snapOnline, snapTrue)

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
  // Tier 1 and stay readable on the trip screens (frame 22).
  if (!online) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px]">
        <div className="flex items-center gap-3">
          <Link
            href="/map"
            aria-label="Back to Map"
            className="flex size-11 flex-none items-center justify-center rounded-full border border-ln2 bg-sf text-tx2"
          >
            <ArrowLeft aria-hidden className="size-5" strokeWidth={2} />
          </Link>
          <h1 className="font-serif text-[25px] font-semibold">Explore</h1>
        </div>
        <div className="lv-enter mt-10 rounded-[calc(var(--r)+2px)] bg-sf p-7 text-center text-tx">
          <WifiOff aria-hidden className="mx-auto size-[34px] text-tx2" strokeWidth={2} />
          <h2 className="mt-3 font-serif text-[21px] font-semibold leading-[1.3]">Explore needs a connection</h2>
          <p className="mx-auto mt-2.5 max-w-sm text-base leading-normal text-tx2">
            The world catalogue lives on the server - far too big to keep on your phone. Your own
            trip works fully offline: stops, stays, budget, check-ins and saved notes are all
            still there.
          </p>
          <Link
            href="/live"
            className="mt-[18px] inline-block rounded-[var(--rCtl)] bg-ac px-5 py-3.5 text-base font-semibold text-on"
          >
            Go to Today →
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px]">
      <div>
        <div className="flex items-center gap-3">
          <Link
            href="/map"
            aria-label="Back to Map"
            className="flex size-11 flex-none items-center justify-center rounded-full border border-ln2 bg-sf text-tx2"
          >
            <ArrowLeft aria-hidden className="size-5" strokeWidth={2} />
          </Link>
          <h1 className="font-serif text-[25px] font-semibold">Explore</h1>
        </div>
        <p className="mt-[5px] text-base leading-normal text-tx2">
          {`Country & city knowledge base - ${fields.length} fields, rendered from the catalogue.`}
        </p>
      </div>

      <label
        className={`flex items-center gap-2.5 rounded-[calc(var(--r)-2px)] border-[1.5px] bg-sf px-3.5 py-[13px] ${
          searching ? 'border-ac' : 'border-transparent focus-within:border-ac'
        }`}
      >
        <Search aria-hidden className="size-[18px] flex-none text-tx2" strokeWidth={2} />
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            setOpenCity(null)
          }}
          placeholder="Search cities or places…"
          className="w-full bg-transparent text-base text-tx outline-none placeholder:text-tx3"
        />
      </label>

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
          <div className="flex flex-wrap gap-[7px]">
            {countryNames.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCountry(country === c ? '' : c)
                  setOpenCity(null)
                }}
                className={`rounded-full border-[1.5px] px-[13px] py-2 text-base font-medium ${
                  country === c ? 'border-ac bg-ac-soft text-tx2' : 'border-ln2 bg-sf text-tx'
                }`}
              >
                {countryFlag(c)} {c}
              </button>
            ))}
          </div>
          {country ? (
            <CityRows cities={browse} onOpen={setOpenCity} />
          ) : (
            <p className="mt-10 text-center text-base text-tx3">
              Pick a country above, or search for a city or place.
            </p>
          )}
        </>
      )}

      {searching && (
        <p className="mt-1 text-base leading-normal text-tx3">
          World data from{' '}
          <a
            href="https://www.geonames.org"
            className="font-medium text-ac2-deep underline"
            rel="noreferrer"
            target="_blank"
          >
            GeoNames
          </a>{' '}
          (CC BY 4.0) and ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            className="font-medium text-ac2-deep underline"
            rel="noreferrer"
            target="_blank"
          >
            OpenStreetMap
          </a>{' '}
          contributors (ODbL).
        </p>
      )}

      {openCity !== null && (
        <div className="mt-3">
          {detail.isPending && <p className="text-base text-tx2">Loading…</p>}
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
    <div className="overflow-hidden rounded-[var(--r)] bg-sf text-tx">
      {cities.map((c) => {
        // World rows carry a GEONAMEID, a different id space from cities.id —
        // opening one would fetch the wrong record or nothing, so only curated
        // cities are clickable. World rows are informational.
        const curated = c.in_catalogue !== false
        const body = (
          <>
            <span aria-hidden>{countryFlag(c.country)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold">{c.city}</span>
              <span className="block truncate text-base text-tx2">
                {[c.country, c.region_name].filter(Boolean).join(' · ')}
              </span>
            </span>
            {curated && c.daily_living_mid != null && (
              <span className="flex-none text-base font-medium text-tx2">${c.daily_living_mid}/day</span>
            )}
            {!curated && (
              <span className="flex-none text-base text-tx2">
                {c.population ? `${Math.round(c.population / 1000)}k people` : 'not catalogued'}
              </span>
            )}
          </>
        )
        return curated ? (
          <button key={c.id} onClick={() => onOpen(c.id)} className={`${rowCls} hover:bg-fill`}>
            {body}
          </button>
        ) : (
          <div key={`g${c.id}`} className={rowCls}>
            {body}
          </div>
        )
      })}
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
  if (loading) return <p className="text-base text-tx2">Searching…</p>

  // Says what the catalogue DOES cover, so a miss reads as a gap in the data
  // rather than a broken search (mock 08 "No results").
  if (total === 0) {
    return (
      <div className="mt-10 text-center">
        <Search aria-hidden className="mx-auto size-[34px] text-tx3" strokeWidth={2} />
        <h2 className="mt-3 font-serif text-[21px] font-semibold leading-[1.3]">{`Nothing matches “${q}”`}</h2>
        <p className="mx-auto mt-2.5 max-w-sm text-base leading-normal text-tx2">
          The catalogue grows as the trip does - and you can still add a stop anywhere, catalogued
          or not.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Count shown so the server-side cap never silently hides matches. */}
      <p className="text-base text-tx2">
        {`Showing ${total} match${total === 1 ? '' : 'es'} · searched on the server`}
      </p>
      {cities.length > 0 && (
        <>
          <h2 className="font-sans text-[17px] font-semibold">Cities</h2>
          <CityRows cities={cities} onOpen={onOpen} />
        </>
      )}
      {places.length > 0 && (
        <>
          <h2 className="font-sans text-[17px] font-semibold">Places</h2>
          <div className="overflow-hidden rounded-[var(--r)] bg-sf text-tx">
            {places.map((p) => (
              <div key={p.id} className={rowCls}>
                <MapPin aria-hidden className="size-[18px] flex-none text-ac2" strokeWidth={2} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">{p.name}</span>
                  <span className="block truncate text-base text-tx2">
                    {[p.city_name, p.kind].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {/* Imported OSM rows carry an OSM id, not a places.id — marked
                    so they are never mistaken for the couple's own places. */}
                {!p.in_catalogue && <span className="flex-none text-base text-tx2">OSM</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// useSyncExternalStore helpers — module-level so their identities are stable
// (same pattern as DashboardClient).
const snapTrue = () => true
const snapOnline = () => navigator.onLine
const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}
