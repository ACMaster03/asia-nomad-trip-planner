'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// Shared toast vocabulary (handoff README + RIG-PARITY §5): the rig's flash()
// — a dark pill, bottom-centred above the tab bar, rise-in, ~2.2s. One at a
// time; a new message replaces the current pill (rig behavior). bg-tx /
// text-canvas invert together per theme, so the pill is always the "ink on
// paper" negative of the screen.
//
// Mounted once in the (app) layout; screens call useToast()('message').

const ToastContext = createContext<(msg: string) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((msg: string) => {
    if (timer.current) clearTimeout(timer.current)
    // key forces a remount per message so lv-enter re-triggers on replace
    setToast({ msg, key: Date.now() })
    timer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* The aria-live container stays mounted so message changes announce. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-[18px]"
      >
        {toast && (
          <div
            key={toast.key}
            role="status"
            className="lv-enter max-w-full rounded-full bg-tx px-4 py-2.5 text-center text-base font-medium text-canvas"
          >
            {toast.msg}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
