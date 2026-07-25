'use client'
import { useEffect, useState } from 'react'

/**
 * Live navigator.onLine. Used wherever a Tier-2 (server-only) feature has to
 * degrade honestly rather than fail: the FX Refresh button, the stop-form city
 * picker, and Explore.
 *
 * Starts true and syncs after mount — SSR has no navigator, and assuming
 * offline first would flash an offline warning on every cold load.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])
  return online
}
