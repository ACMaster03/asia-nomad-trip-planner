'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Settings } from 'lucide-react'
import { Tabs } from '@/components/trips/Tabs'
import { StopsTab } from '@/components/trips/StopsTab'
import { StaysTab } from '@/components/trips/StaysTab'
import { TransportTab } from '@/components/trips/TransportTab'
import { ExtrasTab } from '@/components/trips/ExtrasTab'

const TABS = [
  ['stops', 'Stops'],
  ['stays', 'Stays'],
  ['transport', 'Transport'],
  ['extras', 'Extras'],
] as const
type TabKey = (typeof TABS)[number][0]

export default function ItineraryHub() {
  // ?tab=extras opens on that tab — the Money page's One-offs card (#39) links
  // here by name and should land where it says.
  const param = useSearchParams().get('tab')
  const fromUrl = TABS.some(([k]) => k === param) ? (param as TabKey) : null
  const [tab, setTab] = useState<TabKey>(fromUrl ?? 'stops')
  // Adjusting state on a prop change, during render (react.dev pattern, as in
  // KnowledgeClient): a second link followed while this screen is already
  // mounted still moves the tab.
  const [seenFromUrl, setSeenFromUrl] = useState(fromUrl)
  if (fromUrl !== seenFromUrl) {
    setSeenFromUrl(fromUrl)
    if (fromUrl) setTab(fromUrl)
  }
  return (
    <div>
      {/* Trip settings' only door — the gear right of the capsule (nav "1g"). */}
      <Tabs
        tabs={TABS}
        active={tab}
        onChange={setTab}
        trailing={
          <Link
            href="/settings"
            aria-label="Trip settings"
            className="flex h-[44px] w-[44px] flex-none items-center justify-center rounded-full border border-ln2 bg-sf text-tx2"
          >
            <Settings aria-hidden className="size-5" strokeWidth={2} />
          </Link>
        }
      />
      {tab === 'stops' && <StopsTab />}
      {tab === 'stays' && <StaysTab />}
      {tab === 'transport' && <TransportTab />}
      {tab === 'extras' && <ExtrasTab />}
    </div>
  )
}
