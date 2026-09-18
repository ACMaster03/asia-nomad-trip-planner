'use client'
import Link from 'next/link'
import { X } from 'lucide-react'
import type { City } from '@/lib/catalogue/types'
import type { CityCost } from '@/lib/trips/budget'
import { regName } from '@/lib/trips/format'
import { cityInfoRows } from '@/lib/map/globeData'

// The bottom card for a TAPPED catalogue pin (issue #32 fix 2). Touch has no
// hover, so the tooltip's rows come here instead, and the navigation the pin
// used to do moves inside — with the city attached (fix 1).
export function knowledgeHref(cityId?: number | null) {
  return cityId != null ? `/knowledge?city=${cityId}` : '/knowledge'
}

export function CityInfoCard({ city, cost, onClose }: { city: City; cost?: CityCost; onClose: () => void }) {
  const rows = cityInfoRows(city, cost)
  return (
    <div className="lv-enter absolute inset-x-4 bottom-4 z-10 rounded-[var(--r)] bg-sf p-4 text-tx" role="region" aria-label={`${city.city} details`}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="truncate font-serif text-lg font-semibold">{city.city}</div>
          <div className="mt-[3px] truncate text-base text-tx2">
            {city.country}{cost?.r || city.region ? ` · ${regName(cost?.r ?? city.region ?? '')}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1.5 -mt-1.5 flex size-11 flex-none items-center justify-center rounded-full text-tx2"
        >
          <X aria-hidden className="size-5" strokeWidth={2} />
        </button>
      </div>
      {rows.length > 0 && (
        <ul className="mt-2 flex flex-col gap-[3px] text-base leading-snug">
          {rows.map((r) => (
            <li key={r.text} className={r.muted ? 'text-tx2' : ''}>{r.text}</li>
          ))}
        </ul>
      )}
      <Link
        href={knowledgeHref(city.id)}
        className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ac px-4 text-base font-semibold text-on"
      >
        Open in Knowledge Base
      </Link>
    </div>
  )
}
