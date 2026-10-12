'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, Route, Wallet, Map as MapIcon, MapPin, type LucideIcon } from 'lucide-react'
import { useCheckIn } from '@/components/checkin/CheckInProvider'
import { useTripScope } from '@/lib/trips/TripScope'

// Bottom tab bar, drawn as the phone draws it (ios/Livhold/Components/
// GlassTabBar.swift; Patrik chose it on 2026-09-27 on TestFlight over this
// file's old solid bar): a floating capsule 16px from the sides, at most
// 520 wide and 64 tall, four icon+label tabs with one green highlight that
// slides to the tab you pick, and a raised 56px Check in circle carrying the
// pin in the middle. The handoff's "1g" structure stands: no More tab; Trip
// settings behind the gear on Trip, Account behind the Home avatar, Explore
// folded into Map as its search.
//
// A tab also owns the pages it opens, as a tab's stack does on the phone:
// Account, Reminders, People, a followed journey and a post belong to Home;
// Trip settings to Trip; All entries to Money; Explore to Map. The highlight
// stays on the tab you came from.
//
// Without a journey of your own there is no bar (the phone since 3 Oct: Home
// only). The follower's Home and the create-a-trip screen have no tab to go to.
//
// showCheckIn comes from the server layout: phase gate (startDate <= today <=
// endDate, open-ended stays live) AND editor role — viewers never check in.
// With it off the four tabs spread evenly. Whether the circle belongs on the
// bar whenever a journey exists, as on the phone, is question 1 in
// docs/WEB-IOS-REDESIGN.md.
//
// z-40 + its own stacking context: the map page paints a FIXED globe overlay
// below the bar — without one the bar rendered UNDER it (dogfood 2026-07-24:
// "trapped on the map page").
//
// The capsule is a solid surface on purpose. The phone's bar is Liquid Glass,
// Apple's own material, which stays on the phone (Petra, 2026-10-12): the web
// takes the bar's layout, not its glass.

type Tab = { href: string; label: string; Icon: LucideIcon; owns: string[] }

const TABS: Tab[] = [
  { href: '/dashboard', label: 'Home', Icon: House, owns: ['/account', '/reminders', '/people', '/journeys', '/post'] },
  { href: '/itinerary', label: 'Trip', Icon: Route, owns: ['/settings'] },
  { href: '/money', label: 'Money', Icon: Wallet, owns: [] },
  { href: '/map', label: 'Map', Icon: MapIcon, owns: ['/knowledge'] },
]

/** Room every screen keeps free at the bottom for the bar, as the phone's `reservedHeight`. */
export const NAV_RESERVED_PX = 80

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
  const slots: (Tab | 'checkin')[] = showCheckIn ? [TABS[0], TABS[1], 'checkin', TABS[2], TABS[3]] : [...TABS]
  const activeAt = active ? slots.indexOf(active) : -1

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[calc(4px+env(safe-area-inset-bottom))] pl-[calc(16px+env(safe-area-inset-left))] pr-[calc(16px+env(safe-area-inset-right))]"
    >
      <div className="pointer-events-auto relative mx-auto flex h-16 max-w-[520px] items-center rounded-full border border-ln bg-sf px-1.5 shadow-[0_6px_16px_rgba(0,0,0,.12)]">
        {/* One highlight that slides to the tab you pick (the phone's matchedGeometryEffect). */}
        {activeAt >= 0 && (
          <span
            aria-hidden
            className="absolute top-1.5 h-[52px] rounded-full bg-ac/12 transition-[left] duration-[220ms] ease-out motion-reduce:transition-none"
            style={{
              left: `calc(6px + ${activeAt} * (100% - 12px) / ${slots.length})`,
              width: `calc((100% - 12px) / ${slots.length})`,
            }}
          />
        )}
        {slots.map((s) =>
          s === 'checkin' ? <CheckIn key="checkin" onClick={checkIn.open} /> : <TabLink key={s.href} tab={s} active={s === active} />,
        )}
      </div>
    </nav>
  )
}

function TabLink({ tab: { href, label, Icon }, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        'relative z-[1] flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full ' +
        (active ? 'text-ac' : 'text-tx2')
      }
    >
      <Icon aria-hidden className="size-5" strokeWidth={active ? 2.4 : 2} />
      <span className={'text-[11px] leading-[14px] ' + (active ? 'font-semibold' : 'font-medium')}>{label}</span>
    </Link>
  )
}

// An ACTION, not a destination: it opens the check-in sheet over whatever you
// are looking at. The circle carries a VISIBLE label like its four siblings — an
// unlabelled icon in the one position the thumb reaches first is the easiest
// thing on the bar to press by accident. The circle sits on the icon slot and
// rises above the capsule from there, so "Check in" shares the tabs' baseline.
function CheckIn({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative z-[1] flex h-[52px] min-w-0 flex-1 justify-center">
      <button type="button" onClick={onClick} className="flex h-[52px] flex-col items-center justify-center gap-0.5 whitespace-nowrap">
        <span className="relative h-5 w-14">
          <span className="absolute bottom-[5px] left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full bg-ac text-on shadow-[0_4px_10px_rgba(0,0,0,.2)]">
            <MapPin aria-hidden className="size-6" strokeWidth={2.4} />
          </span>
        </span>
        <span className="text-[11px] font-semibold leading-[14px] text-ac">Check in</span>
      </button>
    </div>
  )
}
