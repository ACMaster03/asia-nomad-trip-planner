'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, Route, Wallet, Map as MapIcon, MapPin, type LucideIcon } from 'lucide-react'
import { useCheckIn } from '@/components/checkin/CheckInProvider'
import { useTripScope } from '@/lib/trips/TripScope'

// Bottom tab bar — the handoff's final nav structure "1g" (design/handoff-v1,
// Menu Options.dc.html): four icon+label tabs, no More tab. Trip settings sit
// behind the gear on the Trip page, Account behind the Home avatar, and
// Explore was folded into Map as its search.
//
// The web keeps this bar, a full-width band with a line on top (Petra,
// 2026-10-12). The phone's floating capsule (ios/Livhold/Components/
// GlassTabBar.swift) works because it is Liquid Glass, Apple's own material,
// which stays on the phone; drawn solid on the web it merged with the white
// cards scrolling under it. What the web takes from the phone's bar is its
// behaviour: a tab owns the pages it opens, as a tab's stack does there
// (Account, Reminders, People, a followed journey and a post keep Home lit;
// Trip settings keeps Trip; All entries keeps Money; Explore keeps Map), and
// without a journey of your own there is no bar at all (the phone since 3 Oct:
// Home only). The follower's Home and the create-a-trip screen have no tab to
// go to; Account carries a "‹ Home" link for the way back.
//
// The raised center Check in circle is there whenever there is a journey, as on
// the phone (Patrik, 2026-10-12). showCheckIn comes from the server layout:
// a journey AND editor role; viewers never check in. Until 12 Oct it showed
// during the live trip only (startDate <= today <= endDate).
//
// z-40 + solid bg: the map page paints a FIXED globe overlay below the bar —
// without a stacking context the bar rendered UNDER it (dogfood 2026-07-24:
// "trapped on the map page").

type Tab = { href: string; label: string; Icon: LucideIcon; owns: string[] }

const TABS: Tab[] = [
  { href: '/dashboard', label: 'Home', Icon: House, owns: ['/account', '/reminders', '/people', '/journeys', '/post'] },
  { href: '/itinerary', label: 'Trip', Icon: Route, owns: ['/settings'] },
  { href: '/money', label: 'Money', Icon: Wallet, owns: [] },
  { href: '/map', label: 'Map', Icon: MapIcon, owns: ['/knowledge'] },
]

export function AppNav({ showCheckIn, pathname: forced }: { showCheckIn: boolean; /** The dev previews pass the route they stand in for. */ pathname?: string }) {
  const here = usePathname()
  const pathname = forced ?? here
  const checkIn = useCheckIn()
  const { tripId } = useTripScope()

  // The personalisation flow is a door, not a destination — no tab bar there.
  if (pathname.startsWith('/welcome')) return null
  if (tripId === null) return null

  const under = (p: string) => pathname === p || pathname.startsWith(p + '/')
  const active = TABS.find((t) => under(t.href) || t.owns.some(under))

  const tab = (t: Tab) => {
    const on = t === active
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={on ? 'page' : undefined}
        className={
          'flex min-h-[52px] flex-col items-center justify-center gap-0.5 pb-1 pt-2 ' +
          (on ? 'font-semibold text-ac' : 'text-tx3')
        }
      >
        <t.Icon aria-hidden className="size-6" strokeWidth={on ? 2.2 : 2} />
        <span className="text-[12px] leading-4">{t.label}</span>
      </Link>
    )
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ln bg-sf pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      // Its own name in a view transition (round 6): the bar stays put while a screen zooms or cross-fades.
      style={{ viewTransitionName: 'lv-nav' }}
    >
      <div className={'relative mx-auto max-w-lg ' + (showCheckIn ? 'grid grid-cols-5' : 'grid grid-cols-4')}>
        {tab(TABS[0])}
        {tab(TABS[1])}
        {showCheckIn && (
          <div className="relative">
            {/* The circle carries a VISIBLE label like its four siblings. An
                unlabelled icon in the one position the thumb reaches first is
                the easiest thing on the bar to press by accident, and the
                accessible name now matches the words on screen. */}
            {/* An ACTION, not a destination. This used to link to /live, a
                screen that is Home again with its own Check in button on it,
                so pressing Check in read as nothing having happened. */}
            <button
              type="button"
              onClick={checkIn.open}
              className="absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-[26px] flex-col items-center whitespace-nowrap"
            >
              {/* The zoom's source while the sheet is closed (the phone's ZoomSource "checkin"): the sheet grows out of the circle and shrinks back into it. */}
              <span className="flex size-[58px] items-center justify-center rounded-full bg-ac text-on shadow-lg ring-4 ring-sf" style={checkIn.isOpen ? undefined : { viewTransitionName: 'lv-checkin' }}>
                <MapPin aria-hidden className="size-6" strokeWidth={2.2} />
              </span>
              <span className="mt-0.5 text-[12px] font-semibold leading-4 text-ac">Check in</span>
            </button>
          </div>
        )}
        {tab(TABS[2])}
        {tab(TABS[3])}
      </div>
    </nav>
  )
}
