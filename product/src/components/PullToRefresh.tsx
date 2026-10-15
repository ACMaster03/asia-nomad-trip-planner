'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TravelLoader } from '@/components/ui/TravelLoader'

// Pull to refresh (round 6; the phone's .refreshable on Home, Trip and Money):
// at the top of a screen, a pull down past a hand's width lets go into a
// refresh of everything the screen is reading (the journey, its events, the
// people you follow), and the TravelLoader shows while it runs. Mounted once
// in the (app) layout, so every screen in the shell has it.
//
// The pull is drawn as the loader coming down from under the top edge, not as
// the screen moving: Trip's globe and header are fixed inside the screen, and
// a transform on the screen would pull them out of place.
//
// Not a pull: a touch that starts in a sheet or a menu, on the globe
// (data-no-pull: its drags turn it), in a field (the keyboard's), or in a part
// that scrolls on its own (the stop page, a sheet's list); a touch while the
// body is held by a sheet's scroll lock; a sideways swipe (the chips, the
// chart); any touch once the page is scrolled. Offline, the pull lets go into
// nothing: the saved copy stays and the screens say there is no connection.

const START = 10 // px down before a touch counts as a pull
const THRESHOLD = 72 // px of pull that lets go into a refresh
const MAX = 108
const HOLD = 54 // where the loader sits while it refreshes
const MIN_SPIN = 650 // ms the loader shows at least, so a quick refresh is still seen
const MAX_SPIN = 8000 // ms after which the loader goes even if a fetch still hangs; the fetch finishes on its own

type Phase = 'idle' | 'pulling' | 'refreshing' | 'done'

function scrollsItself(from: Element): boolean {
  for (let n: Element | null = from; n && n !== document.body; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return true
  }
  return false
}

export function PullToRefresh() {
  const qc = useQueryClient()
  const [pull, setPull] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  const pullRef = useRef(0)
  const touch = useRef<{ x: number; y: number; pulling: boolean } | null>(null)
  const go = useCallback((p: Phase) => { phaseRef.current = p; setPhase(p) }, [])

  useEffect(() => {
    const refresh = async () => {
      go('refreshing')
      const t0 = performance.now()
      if (navigator.onLine !== false) {
        // A refetch that fails leaves the cached copy; the screens' own notices say so.
        const refetch = qc.refetchQueries({ type: 'active' }).catch(() => undefined)
        await Promise.race([refetch, new Promise((r) => setTimeout(r, MAX_SPIN))])
      }
      const left = MIN_SPIN - (performance.now() - t0)
      if (left > 0) await new Promise((r) => setTimeout(r, left))
      pullRef.current = 0
      setPull(0)
      go('done')
      setTimeout(() => { if (phaseRef.current === 'done') go('idle') }, 400)
    }
    const onStart = (e: TouchEvent) => {
      if (phaseRef.current === 'refreshing' || e.touches.length !== 1) return
      if (window.scrollY > 0 || document.body.style.position === 'fixed') return
      const t = e.target as Element | null
      if (!t || t.closest('[role="dialog"], [data-no-pull], input, textarea, select') || scrollsItself(t)) return
      touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, pulling: false }
    }
    const onMove = (e: TouchEvent) => {
      const s = touch.current
      if (!s) return
      const dx = e.touches[0].clientX - s.x
      const dy = e.touches[0].clientY - s.y
      if (!s.pulling) {
        if (dy < START) {
          if (dy < -4 || Math.abs(dx) > 12) touch.current = null
          return
        }
        if (Math.abs(dx) > dy || window.scrollY > 0) { touch.current = null; return }
        s.pulling = true
        go('pulling')
      }
      if (e.cancelable) e.preventDefault()
      // Damped: the loader lags the finger more the further it is pulled.
      const d = Math.min(MAX, Math.pow(Math.max(0, dy - START), 0.88))
      pullRef.current = d
      setPull(d)
    }
    const onEnd = () => {
      const s = touch.current
      touch.current = null
      if (!s?.pulling) return
      if (pullRef.current >= THRESHOLD) void refresh()
      else { pullRef.current = 0; setPull(0); go('idle') }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [qc, go])

  const busy = phase === 'refreshing'
  const y = busy || phase === 'done' ? HOLD : pull
  const progress = Math.min(1, pull / THRESHOLD)
  const shown = phase === 'pulling' ? Math.max(0.3, progress) : busy ? 1 : 0
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-[45] flex justify-center"
      style={{
        transform: `translateY(${Math.round(y) - 44}px)`,
        opacity: shown,
        transition: phase === 'pulling' ? 'none' : 'transform var(--lv-settle) var(--lv-ease), opacity var(--lv-quick) var(--lv-ease)',
      }}
    >
      <div className="flex h-9 items-center rounded-full bg-sf px-4 shadow-md ring-1 ring-ln">
        <TravelLoader progress={busy ? undefined : progress} />
      </div>
      <span className="sr-only">{busy ? 'Refreshing' : ''}</span>
    </div>
  )
}
