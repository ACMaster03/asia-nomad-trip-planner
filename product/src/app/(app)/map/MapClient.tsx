'use client'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchCountries } from '@/lib/catalogue/queries'
import { qk } from '@/lib/catalogue/keys'
import { useTripScreen } from '@/lib/trips/useTripScreen'

// ssr:false is allowed only inside a Client Component (Next 16). three.js touches window.
const GlobeView = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-neutral-400">Loading the globe…</div>,
})

export default function MapClient() {
  const sb = createClient()
  const { trip, cities, cityIdx } = useTripScreen()
  const { data: countries = [] } = useQuery({ queryKey: qk.countries, queryFn: () => fetchCountries(sb) })
  const state = trip.data?.state
  // top-14 tucks the overlay under the nav bar; the nav itself is z-40 with a
  // solid background, so any small overlap (or the open phone menu) always
  // paints ABOVE the globe — no more being trapped on this page.
  return (
    <div className="fixed inset-x-0 bottom-0 top-14 bg-[#0b0f14]">
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
