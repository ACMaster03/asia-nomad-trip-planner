'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchCities, fetchCountries } from '@/lib/catalogue/queries'
import { getAtJsonPath } from '@/lib/catalogue/getAtJsonPath'
import { qk } from '@/lib/catalogue/keys'
import type { City } from '@/lib/catalogue/types'
import type { Segment, TransportLeg } from '@/lib/trips/types'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { tk } from '@/lib/trips/keys'
import { fetchMyFollowing } from '@/lib/follow/follows'
import { useFollowedRoutes } from '@/lib/follow/useFollowedRoutes'
import { peopleByCity, type PeopleAtCity } from '@/lib/map/people'
import { CityInfoCard, knowledgeHref } from '@/components/map/CityInfoCard'
import { PeopleSheet, type TripPick } from '@/components/map/PeopleSheet'

// Stable fallbacks: a fresh `[]` per render used to change the globe's prop
// identity every render while the trip loaded (issue #32 fix 3).
const NO_CITIES: City[] = []
const NO_SEGMENTS: Segment[] = []
const NO_TRANSPORT: TransportLeg[] = []
const NO_RATES: Record<string, number> = {}

// ssr:false is allowed only inside a Client Component (Next 16). three.js touches window.
const GlobeView = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-base text-[rgba(216,224,229,.6)]">Loading the globe…</div>,
})

export default function MapClient() {
  const sb = createClient()
  const { trip, cityIdx } = useTripScreen()
  // The globe renders hover cards with wifi/landmarks/weather, so this screen
  // still needs the FULL rows. It keeps its own query (already prefetched by
  // map/page.tsx) rather than making every other screen pay for attributes.
  const cities = useQuery({
    queryKey: qk.cities,
    queryFn: () => fetchCities(sb),
    staleTime: 6 * 60 * 60_000,
  })
  const { data: countries = [] } = useQuery({ queryKey: qk.countries, queryFn: () => fetchCountries(sb) })
  const state = trip.data?.state
  // A tapped pin swaps the bottom card to that city (fix 2); closing it brings
  // the stop card back.
  const [picked, setPicked] = useState<City | null>(null)

  // Issue #9: the people you follow, by the city they are in, and one of
  // their routes drawn beside yours. Fails soft: without migration 33 the
  // query errors once and the map is simply yours.
  const following = useQuery({ queryKey: tk.following, queryFn: () => fetchMyFollowing(sb), staleTime: 5 * 60_000, retry: false })
  const summaries = useFollowedRoutes(following.data)
  const [peopleAt, setPeopleAt] = useState<PeopleAtCity | null>(null)
  const [selected, setSelected] = useState<TripPick | null>(null)

  // Bottom city card (frame 19): the current stop while travelling, otherwise
  // the next one coming up (or the first, pre-trip).
  const todayIso = new Date().toISOString().slice(0, 10)
  const people = useMemo(
    () => peopleByCity(following.data ?? [], cities.data ?? [], summaries, todayIso),
    [following.data, cities.data, summaries, todayIso],
  )
  const theirRoute = useMemo(() => {
    const route = selected ? summaries[selected.trip_id]?.route : undefined
    return selected && route ? { name: selected.label, route } : null
  }, [selected, summaries])
  const sorted = (state?.segments ?? [])
    .filter((x) => x.include !== false)
    .slice()
    .sort((a, b) => a.arrive.localeCompare(b.arrive))
  const stop =
    sorted.find((seg) => seg.arrive <= todayIso && todayIso <= seg.depart) ??
    sorted.find((seg) => seg.arrive > todayIso) ??
    sorted[0]
  const stopNo = stop ? sorted.indexOf(stop) + 1 : 0
  const nights = stop ? Math.max(1, Math.round((+new Date(stop.depart) - +new Date(stop.arrive)) / 86400000)) : 0
  const stopCity = stop ? (cities.data ?? []).find((c) => c.city === stop.city) : undefined
  const wifiRaw = getAtJsonPath(stopCity?.attributes, 'internet')
  const wifi = typeof wifiRaw === 'string' || typeof wifiRaw === 'number' ? String(wifiRaw) : null

  // Full-bleed to the top now that the top bar is gone; the bottom tab bar is
  // z-40 with a solid background, so it always paints ABOVE the globe — no
  // more being trapped on this page.
  return (
    <div className="fixed inset-x-0 top-0 bottom-[calc(76px+env(safe-area-inset-bottom))] bg-[#0b0f14]">
      {/* Explore retired as a destination — its search lives here (top-right).
          Links to the old /knowledge screen until Phase 7 embeds it. */}
      <Link
        href="/knowledge"
        aria-label="Search places"
        className="absolute right-4 top-[calc(16px+env(safe-area-inset-top))] z-10 flex h-[44px] w-[44px] items-center justify-center rounded-full border border-[rgba(216,224,229,.16)] bg-[rgba(11,15,20,.86)] text-[#d8e0e5] backdrop-blur"
      >
        <Search aria-hidden className="size-5" strokeWidth={2} />
      </Link>
      <GlobeView
        cities={cities.data ?? NO_CITIES}
        countries={countries}
        cityIdx={cityIdx}
        segments={state?.segments ?? NO_SEGMENTS}
        transport={state?.transport ?? NO_TRANSPORT}
        rates={state?.rates ?? NO_RATES}
        onPickCity={setPicked}
        people={people}
        theirRoute={theirRoute}
        today={todayIso}
        onPickPeople={setPeopleAt}
      />
      {selected && (
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="absolute left-4 top-[calc(64px+env(safe-area-inset-top))] z-10 flex items-center gap-2 rounded-full border border-[rgba(140,184,220,.5)] bg-[rgba(11,15,20,.86)] px-3.5 py-2 text-base font-medium text-[#8CB8DC] backdrop-blur"
        >
          {selected.label}&rsquo;s route
          <X aria-hidden className="size-4" strokeWidth={2} />
        </button>
      )}
      {peopleAt && (
        <PeopleSheet
          group={peopleAt}
          segments={state?.segments ?? NO_SEGMENTS}
          summaries={summaries}
          today={todayIso}
          selectedTrip={selected?.trip_id ?? null}
          onSelect={(p) => { setSelected(p); setPeopleAt(null) }}
          onClose={() => setPeopleAt(null)}
        />
      )}
      {picked && <CityInfoCard city={picked} cost={cityIdx[picked.city]} onClose={() => setPicked(null)} />}
      {!picked && stop && (
        <div className="lv-enter absolute inset-x-4 bottom-4 z-10 rounded-[var(--r)] bg-sf p-4 text-tx">
          <div className="flex items-center justify-between gap-2.5">
            <div className="min-w-0">
              <div className="truncate font-serif text-lg font-semibold">{stop.city}</div>
              <div className="mt-[3px] truncate text-base text-tx2">
                Stop {stopNo} · {nights} nights{wifi ? ` · wifi ${wifi}` : ''}
              </div>
            </div>
            <Link
              href={knowledgeHref(stopCity?.id)}
              className="flex-none rounded-full bg-ac px-4 py-[11px] text-base font-semibold text-on"
            >
              Details
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
