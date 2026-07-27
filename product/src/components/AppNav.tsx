'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// App navigation. Desktop keeps the horizontal bar; phones get a hamburger
// sheet — the full link list wrapped to two crowded rows on small screens
// (dogfood 2026-07-24). showLive comes from the server layout's trip gate.
//
// Every link here except Account is trip-scoped, which is why Account sits
// apart under the avatar (mock 13): it is the one destination that still works
// when there is no readable trip.

export function AppNav({ showLive, userEmail }: { showLive: boolean; userEmail?: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const links: Array<[string, string]> = [
    ['/dashboard', 'Dashboard'],
    ...(showLive ? ([['/live', 'Live']] as Array<[string, string]>) : []),
    ['/itinerary', 'Itinerary'],
    ['/money', 'Money'],
    ['/map', 'Map'],
    ['/knowledge', 'Explore'],
    ['/settings', 'Trip settings'],
  ]
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const linkCls = (href: string) =>
    isActive(href) ? 'font-semibold text-teal-600' : 'hover:underline'
  const initial = (userEmail?.trim()[0] ?? '?').toUpperCase()

  return (
    // relative + z-40 + solid bg: the map page paints a FIXED globe overlay
    // below the bar — without a stacking context the open phone menu (and, on
    // wrapped navs, the second row) rendered UNDER it (dogfood 2026-07-24:
    // "trapped on the map page").
    <nav className="relative z-40 border-b border-neutral-200 bg-white text-sm dark:border-neutral-800 dark:bg-neutral-950">
      {/* phone: brand + hamburger */}
      <div className="flex items-center justify-between px-4 py-3 sm:hidden">
        <Link href="/dashboard" className="font-semibold" onClick={() => setOpen(false)}>
          🧭 Asia Nomad Planner
        </Link>
        <button
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="rounded border border-neutral-300 px-2.5 py-1.5 text-base leading-none dark:border-neutral-700"
        >
          {open ? '✕' : '☰'}
        </button>
      </div>
      {open && (
        <div className="border-t border-neutral-200 px-4 pb-3 sm:hidden dark:border-neutral-800">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={'block py-2.5 text-base ' + linkCls(href)}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className={
              'mt-1 flex items-center gap-2 border-t border-neutral-200 pt-3 text-base dark:border-neutral-800 ' +
              linkCls('/account')
            }
          >
            <span
              aria-hidden
              className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-teal-500 bg-teal-500/10 text-xs font-bold text-teal-700 dark:text-teal-400"
            >
              {initial}
            </span>
            Account
          </Link>
        </div>
      )}

      {/* desktop: the original horizontal bar */}
      <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex">
        <Link href="/dashboard" className="font-semibold">🧭 Asia Nomad Planner</Link>
        {links.slice(0, -1).map(([href, label]) => (
          <Link key={href} href={href} className={linkCls(href)}>{label}</Link>
        ))}
        <Link href="/settings" className={'ml-auto ' + linkCls('/settings')}>Trip settings</Link>
        <Link href="/account" aria-label="Account" title={userEmail || 'Account'}>
          <span
            className={
              'flex h-8 w-8 items-center justify-center rounded-full border bg-teal-500/10 text-xs font-bold text-teal-700 dark:text-teal-400 ' +
              (isActive('/account') ? 'border-teal-600 ring-2 ring-teal-600/30' : 'border-teal-500')
            }
          >
            {initial}
          </span>
        </Link>
      </div>
    </nav>
  )
}
