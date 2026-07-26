'use client'
import { useEffect } from 'react'

// Auto-apply app updates (dogfood 2026-07-24: the installed PWA kept running
// stale code until a force-quit). Three parts:
//   1. CHECK: ask for a new service worker on launch, on every return to the
//      foreground, and every 15 min while open — an installed app can sit
//      resumed for days without a navigation, so the default
//      check-on-navigation never fires.
//   2. APPLY: sw.ts uses skipWaiting + clientsClaim, so a found update takes
//      control immediately → 'controllerchange' fires here.
//   3. RELOAD: reload the page on controllerchange so the running JS matches
//      the new worker — deferred while the user is mid-typing (reload happens
//      when the app next goes to the background instead).
export function SWUpdate() {
  // Fade out the server-rendered boot splash once React is alive (it lives in
  // the root layout, so this runs on every page).
  //
  // HIDE IT WITH CSS, NEVER .remove(). The splash is rendered by React in the
  // root layout, and <Providers> emits no DOM element, so the page's top-level
  // nodes are the splash's SIBLINGS inside <body> — one shared container.
  // Deleting the node out-of-band left React's fiber pointing at a node that
  // was no longer a child of <body>, so the next client-side navigation threw
  // NotFoundError from insertOrAppendPlacementNodeIntoContainer and Next showed
  // "This page couldn't load". A full reload always looked fine because the
  // document was re-parsed and hydrated consistently — then broke again 400ms
  // later. (Prod bug, 2026-07-26.)
  useEffect(() => {
    document.getElementById('anp-splash')?.classList.add('anp-hide')
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // First-ever install also fires controllerchange (clientsClaim) — that
    // one must NOT reload, the page is already the newest version.
    let hadController = !!navigator.serviceWorker.controller
    let reloading = false

    const reload = () => {
      if (reloading) return
      reloading = true
      try {
        // tells the next load's splash to say "Updating…" instead of "Loading…"
        sessionStorage.setItem('anp-updating', '1')
      } catch {
        /* private-mode storage failures never block the update */
      }
      window.location.reload()
    }
    const onControllerChange = () => {
      if (!hadController) {
        hadController = true
        return
      }
      const el = document.activeElement
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      if (document.visibilityState === 'visible' && typing) {
        // don't rip the page out from under a half-written check-in
        const onHide = () => {
          if (document.visibilityState === 'hidden') {
            document.removeEventListener('visibilitychange', onHide)
            reload()
          }
        }
        document.addEventListener('visibilitychange', onHide)
      } else {
        reload()
      }
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const check = () =>
      navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.update())
        .catch(() => {})
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(check, 15 * 60_000)
    check()

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [])
  return null
}

// build-stamp: auto-update E2E test (2026-07-24)
