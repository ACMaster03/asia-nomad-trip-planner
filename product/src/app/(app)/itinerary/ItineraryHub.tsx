'use client'
import { Timeline } from '@/components/trips/Timeline'

// Trip is ONE timeline (mock 15 §1, #58): no Stops / Stays / Transport /
// Extras tabs. Extras are One-offs on Money (#39), added and changed on its
// card since round 3c; page.tsx sends the old ?tab=extras link there.
export default function ItineraryHub() {
  return <Timeline />
}
