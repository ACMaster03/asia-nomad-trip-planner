'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Timeline } from '@/components/trips/Timeline'
import { ExtrasTab } from '@/components/trips/ExtrasTab'

// Trip is ONE timeline now (mock 15 §1, #58): no Stops / Stays / Transport /
// Extras tabs. Extras are One-offs on Money (#39); until the Money page grows
// its own One-offs editor (mock 16, the next build), its card still links to
// ?tab=extras, so that one door stays open, tabs or not.
export default function ItineraryHub() {
  const tab = useSearchParams().get('tab')
  if (tab === 'extras') {
    return (
      <div>
        <div className="mx-auto max-w-xl px-[18px] pt-4">
          <Link href="/itinerary" className="inline-flex min-h-11 items-center text-base font-semibold text-ac2">← Trip</Link>
        </div>
        <ExtrasTab />
      </div>
    )
  }
  return <Timeline />
}
