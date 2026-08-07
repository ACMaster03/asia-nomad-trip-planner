'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchCities, fetchCountries } from '@/lib/catalogue/queries'
import { getAtJsonPath } from '@/lib/catalogue/getAtJsonPath'
import { qk } from '@/lib/catalogue/keys'
import { useTripScreen } from '@/lib/trips/useTripScreen'

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

  // Bottom city card (frame 19): the current stop while travelling, otherwise
  // the next one coming up (or the first, pre-trip).
  const todayIso = new Date().toISOString().slice(0, 10)
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
  const wifiRaw = stop ? getAtJsonPath((cities.data ?? []).find((c) => c.city === stop.city)?.attributes, 'internet') : undefined
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
        className="absolute right-4 top-4 z-10 flex h-[44px] w-[44px] items-center justify-center rounded-full border border-[rgba(216,224,229,.16)] bg-[rgba(11,15,20,.86)] text-[#d8e0e5] backdrop-blur"
      >
        <Search aria-hidden className="size-5" strokeWidth={2} />
      </Link>
      <GlobeView
        cities={cities.data ?? []}
        countries={countries}
        cityIdx={cityIdx}
        segments={state?.segments ?? []}
        transport={state?.transport ?? []}
        rates={state?.rates ?? {}}
      />
      {stop && (
        <div className="lv-enter absolute inset-x-4 bottom-4 z-10 rounded-[var(--r)] bg-sf p-4 text-tx">
          <div className="flex items-center justify-between gap-2.5">
            <div className="min-w-0">
              <div className="truncate font-serif text-lg font-semibold">{stop.city}</div>
              <div className="mt-[3px] truncate text-base text-tx2">
                Stop {stopNo} · {nights} nights{wifi ? ` · wifi ${wifi}` : ''}
              </div>
            </div>
            <Link
              href="/knowledge"
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
