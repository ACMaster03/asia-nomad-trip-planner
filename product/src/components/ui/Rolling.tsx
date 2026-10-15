'use client'
import { useEffect, useRef, useState } from 'react'
import { reduceMotion } from '@/lib/motion/viewTransition'

// Figures that roll to their new value (round 6; the phone's
// .contentTransition(.numericText()) with Motion.settle): when the amount a
// figure shows changes, it counts from the old value to the new one over a
// beat, instead of cutting. The first value a figure shows is shown at once.
//
// Slots: Money's big figure is drawn by a different branch for the stop and
// for the journey, so switching the two mounts a fresh figure. A figure with a
// slot starts from what the slot last showed and rolls from there; the switch
// then reads as one figure changing, as on the phone, and so does coming back
// to Money after an entry was added elsewhere.

const DURATION = 450
const SLOT_TTL = 10 * 60_000 // a figure left this long ago is shown, not rolled from
const ease = (t: number) => 1 - Math.pow(1 - t, 3)
const slots = new Map<string, { value: number; at: number }>()

/** The number to show for `value` right now: the previous one on its way there. */
export function useRollingValue(value: number, slot?: string): number {
  const [shown, setShown] = useState(() => {
    const last = slot ? slots.get(slot) : undefined
    return last && Date.now() - last.at < SLOT_TTL && Number.isFinite(last.value) ? last.value : value
  })
  const current = useRef(shown)
  // The slot always holds what its figure shows, for the next figure in it to
  // roll from. Written after every render: the next figure reads it while it
  // renders, before this one's cleanup would have run.
  useEffect(() => {
    if (slot) slots.set(slot, { value: current.current, at: Date.now() })
  })
  useEffect(() => {
    if (value === current.current) return
    const from = current.current
    const jump = reduceMotion() || !Number.isFinite(value) || !Number.isFinite(from)
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = jump ? 1 : Math.min(1, (now - t0) / DURATION)
      const v = p < 1 ? from + (value - from) * ease(p) : value
      current.current = v
      if (slot) slots.set(slot, { value: v, at: Date.now() })
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, slot])
  return shown
}

/** `format(value)`, rolling from the value shown before. */
export function RollingNumber({ value, format, slot, className }: {
  value: number
  format: (n: number) => string
  slot?: string
  className?: string
}) {
  const shown = useRollingValue(value, slot)
  return <span className={className}>{format(shown)}</span>
}
