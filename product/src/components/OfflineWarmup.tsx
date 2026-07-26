'use client'
import { useEffect } from 'react'

// Rendered once inside the signed-in (app) layout: asks the service worker to
// hard-cache every main route as a DOCUMENT, so a force-quit + offline
// relaunch works no matter which screen iOS restores (see sw.ts WARM_PAGES).
// Screen DATA comes from the persisted TanStack cache; this covers the shells.
const ROUTES = ['/dashboard', '/live', '/itinerary', '/money', '/map', '/knowledge', '/settings']

export function OfflineWarmup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !navigator.onLine) return

    // Respect an explicit data-saving preference, and don't warm 7 routes over
    // a 2G-class link where it would only slow down what the user asked for.
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }).connection
    if (conn?.saveData) return
    if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return

    // DELAYED. Warming used to fire the moment the layout mounted, so it raced
    // the current screen's own data fetches for the phone's connection. It is
    // background work for a FUTURE offline launch — nothing waits on it, so it
    // can happily start once the screen the user asked for has settled.
    const timer = setTimeout(() => {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.active?.postMessage({ type: 'WARM_PAGES', urls: ROUTES })
      })
    }, 5000)
    return () => clearTimeout(timer)
  }, [])
  return null
}
