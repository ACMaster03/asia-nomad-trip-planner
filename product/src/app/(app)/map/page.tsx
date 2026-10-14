import { Map as MapIcon } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

// The Map tab, empty (round 3b of the redesign; Patrik, 12 Oct, decision 2):
// the globe moved onto Trip, as on the phone, and this page stays as the
// phone's placeholder does, so the bar is not lopsided around Check in. What
// takes its place is open (Petra, 12 Oct: the phone's may become a feed page).
// The planner globe with its catalogue pins, people layer and hazards is still
// in `MapClient.tsx`, reachable in development at /dev/map-preview?screen=map.
export default function MapPage() {
  return (
    <main className="mx-auto max-w-xl px-4 pb-6 pt-[18px]">
      <PageHeader title="Map" />
      <div className="mt-3 flex h-[420px] items-center justify-center gap-2 rounded-[var(--r)] bg-fill text-base font-medium text-tx2">
        <MapIcon aria-hidden className="size-5" strokeWidth={2} /> Nothing here yet
      </div>
      <p className="mt-3 text-[13px] text-tx3">The globe is on Trip now.</p>
    </main>
  )
}
