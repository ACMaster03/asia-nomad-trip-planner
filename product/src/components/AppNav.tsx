'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// App navigation. Desktop keeps the horizontal bar; phones get a hamburger
// sheet — the full link list wrapped to two crowded rows on small screens
// (dogfood 2026-07-24). showLive comes from the server layout's trip gate.

export function AppNav({ showLive }: { showLive: boolean }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const links: Array<[string, string]> = [
    ['/dashboard', 'Dashboard'],
    ...(showLive ? ([['/live', 'Live']] as Array<[string, string]>) : []),
    ['/itinerary', 'Itinerary'],
    ['/money', 'Money'],
    ['/map', 'Map'],
    ['/knowledge', 'Explore'],
    ['/settings', 'Settings'],
  ]
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const linkCls = (href: string) =>
    isActive(href) ? 'font-semibold text-teal-600' : 'hover:underline'

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
        </div>
      )}

      {/* desktop: the original horizontal bar */}
      <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex">
        <Link href="/dashboard" className="font-semibold">🧭 Asia Nomad Planner</Link>
        {links.slice(0, -1).map(([href, label]) => (
          <Link key={href} href={href} className={linkCls(href)}>{label}</Link>
        ))}
        <Link href="/settings" className={'ml-auto ' + linkCls('/settings')}>Settings</Link>
      </div>
    </nav>
  )
}
