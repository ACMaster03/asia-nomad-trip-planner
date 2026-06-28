'use client'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchCities } from '@/lib/catalogue/queries'
import { qk } from '@/lib/catalogue/keys'

// ssr:false is allowed only inside a Client Component (Next 16). three.js touches window.
const GlobeView = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-neutral-400">Loading the globe…</div>,
})

export default function MapClient() {
  const sb = createClient()
  const { data: cities = [] } = useQuery({ queryKey: qk.cities, queryFn: () => fetchCities(sb) })
  return (
    <div className="fixed inset-x-0 bottom-0 top-[57px] bg-[#0b0f14]">
      <GlobeView cities={cities} />
    </div>
  )
}
