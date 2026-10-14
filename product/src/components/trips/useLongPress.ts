'use client'
import { useRef } from 'react'

// A long press on a card (the phone's context menu, round 3c): hold for half a
// second without moving, and the menu opens instead of the tap. A right click
// does the same on a desktop. The tap that ends a long press is swallowed, so
// the card does not also open.
export function useLongPress(onLongPress: () => void, { ms = 500, enabled = true }: { ms?: number; enabled?: boolean } = {}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  if (!enabled) return { handlers: {}, firedRef: fired }
  return {
    firedRef: fired,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return
        fired.current = false
        start.current = { x: e.clientX, y: e.clientY }
        clear()
        timer.current = setTimeout(() => { timer.current = null; fired.current = true; onLongPress() }, ms)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear()
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); fired.current = true; onLongPress() },
    },
  }
}
