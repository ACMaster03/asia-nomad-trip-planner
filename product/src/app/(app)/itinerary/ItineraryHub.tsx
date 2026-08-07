'use client'
import { useState } from 'react'
import Link from 'next/link'
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
  const [tab, setTab] = useState<TabKey>('stops')
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
