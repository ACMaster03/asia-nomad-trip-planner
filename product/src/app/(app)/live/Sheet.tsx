'use client'
import { useEffect, useRef } from 'react'

// LIVHOLD bottom sheet (handoff frames 23/26 vocabulary): dim scrim + bottom-
// anchored bg-sf panel with a grab handle. Focus / Escape / scroll-lock
// behavior mirrors components/trips/Modal.tsx — including the onCloseRef
// pattern that keeps iOS from closing the keyboard on every keystroke of
// parent-held form state (phone dogfood, 2026-07-24).
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string
  onClose: () => void
  children: React.ReactNode
}) {
  const sheetRef = useRef<HTMLDivElement>(null)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden' // lock background scroll
    if (!sheetRef.current?.contains(document.activeElement)) {
      sheetRef.current?.focus()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, []) // mount-only, on purpose — see onCloseRef above

  return (
    <div
      className="fixed inset-0 z-50 bg-tx/45"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="lv-enter fixed inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col gap-[13px] overflow-y-auto rounded-t-[var(--r)] bg-sf px-[18px] pb-[max(26px,env(safe-area-inset-bottom))] pt-2.5 text-tx outline-none"
      >
        <div aria-hidden className="mx-auto h-[5px] w-11 flex-none rounded-full bg-ln3" />
        {children}
      </div>
    </div>
  )
}
