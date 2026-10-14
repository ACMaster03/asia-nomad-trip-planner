'use client'
import { useEffect, useRef } from 'react'

// Which app screen was open before this one, for a "‹ Money" that can go BACK
// instead of forward (Petra, 14 Oct: Money took long to come back from All
// entries). A link to /money renders Money's page on the server again, a trip
// to the server on every tap; the browser's back restores the screen it
// already has, at once. Each screen that takes part records itself here on
// mount, and reads what was there before.
//
// A ref, not state: nothing is rendered from it, it is read in a tap. Strict
// mode's double mount reads its own entry the second time and keeps the first.
const KEY = 'lv-last-screen'

export function useCameFrom(here: string) {
  const from = useRef<string | null>(null)
  useEffect(() => {
    try {
      const v = sessionStorage.getItem(KEY)
      if (v !== here) from.current = v
      sessionStorage.setItem(KEY, here)
    } catch {
      // private mode, or storage blocked: the link goes forward, as before
    }
  }, [here])
  return from
}
