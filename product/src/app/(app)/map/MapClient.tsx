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
  // top-[57px] aligns under the (app) nav (single-row at >=md; it can wrap on very narrow viewports).
  return (
    <div className="fixed inset-x-0 bottom-0 top-[57px] bg-[#0b0f14]">
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
