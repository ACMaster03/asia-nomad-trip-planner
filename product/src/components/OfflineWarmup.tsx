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
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.active?.postMessage({ type: 'WARM_PAGES', urls: ROUTES })
    })
  }, [])
  return null
}
