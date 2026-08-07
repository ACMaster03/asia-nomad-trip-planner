'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, Route, Wallet, Map as MapIcon, MapPin } from 'lucide-react'

// Bottom tab bar — the handoff's final nav structure "1g" (design/handoff-v1,
// Menu Options.dc.html): four icon+label tabs, no More tab. Trip settings sit
// behind the gear on the Trip page, Account behind the Home avatar, and
// Explore was folded into Map as its search.
//
// The raised center check-in button appears ONLY during the live trip.
// showCheckIn comes from the server layout: phase gate (startDate <= today <=
// endDate, open-ended stays live) AND editor role — the same rule that gated
// the old Live tab; viewers never check in. It links to /live until Phase 7
// replaces that screen with the check-in sheet.
//
// z-40 + solid bg: the map page paints a FIXED globe overlay below the bar —
// without a stacking context the bar rendered UNDER it (dogfood 2026-07-24:
// "trapped on the map page").

const TABS = [
  { href: '/dashboard', label: 'Home', Icon: House },
  { href: '/itinerary', label: 'Trip', Icon: Route },
  { href: '/money', label: 'Money', Icon: Wallet },
  { href: '/map', label: 'Map', Icon: MapIcon },
] as const

export function AppNav({ showCheckIn }: { showCheckIn: boolean }) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  // The personalisation flow is a door, not a destination — no tab bar there.
  if (pathname.startsWith('/welcome')) return null

  const tab = ({ href, label, Icon }: (typeof TABS)[number]) => {
    const active = isActive(href)
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={
          'flex min-h-[52px] flex-col items-center justify-center gap-0.5 pb-1 pt-2 ' +
          (active ? 'font-semibold text-ac' : 'text-tx3')
        }
      >
        <Icon aria-hidden className="size-6" strokeWidth={active ? 2.2 : 2} />
        <span className="text-[12px] leading-4">{label}</span>
      </Link>
    )
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ln bg-sf pb-[env(safe-area-inset-bottom)]"
    >
      <div className={'relative mx-auto max-w-lg ' + (showCheckIn ? 'grid grid-cols-5' : 'grid grid-cols-4')}>
        {tab(TABS[0])}
        {tab(TABS[1])}
        {showCheckIn && (
          <div className="relative">
            <Link
              href="/live"
              aria-label="Check in"
              className="absolute left-1/2 top-0 flex h-[58px] w-[58px] -translate-x-1/2 -translate-y-[26px] items-center justify-center rounded-full bg-ac text-on shadow-lg ring-4 ring-sf"
            >
              <MapPin aria-hidden className="size-6" strokeWidth={2.2} />
            </Link>
          </div>
        )}
        {tab(TABS[2])}
        {tab(TABS[3])}
      </div>
    </nav>
  )
}
