'use client'
import { useState } from 'react'
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
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'stops' && <StopsTab />}
      {tab === 'stays' && <StaysTab />}
      {tab === 'transport' && <TransportTab />}
      {tab === 'extras' && <ExtrasTab />}
    </div>
  )
}
