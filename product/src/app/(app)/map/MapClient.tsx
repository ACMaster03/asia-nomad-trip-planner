'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchCities, fetchCountries } from '@/lib/catalogue/queries'
import { qk } from '@/lib/catalogue/keys'
import { useTripScreen } from '@/lib/trips/useTripScreen'

// ssr:false is allowed only inside a Client Component (Next 16). three.js touches window.
const GlobeView = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-neutral-400">Loading the globe…</div>,
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
        className="absolute right-4 top-4 z-10 flex h-[44px] w-[44px] items-center justify-center rounded-full bg-white/10 text-white backdrop-blur"
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
    </div>
  )
}
