'use client'
import { useEffect, useRef } from 'react'

// Dark-surface modal for the always-dark Map screen (handoff frame 19: the map
// keeps dark chrome in BOTH themes, so these panels can't use the theme-aware
// trips/Modal — its bg-sf goes white in light mode). Behavior mirrors
// trips/Modal exactly: focus, Escape, background scroll lock, backdrop click.
export function MapModal({
  title,
  label,
  onClose,
  children,
}: {
  title: React.ReactNode
  /** aria-label when title is not a plain string */
  label?: string
  onClose: () => void
  children: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // onClose is almost always an inline arrow → new identity on every parent
  // render. It must NOT be an effect dependency (see trips/Modal for the iOS
  // keyboard-stealing history).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (!dialogRef.current?.contains(document.activeElement)) {
      dialogRef.current?.focus()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, []) // mount-only, on purpose — see onCloseRef above

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === 'string' ? title : 'Details')}
        // Height-capped + internally scrollable: on phones the panel used to
        // outgrow the viewport and its tail (table rows, Close) ended up
        // unreachable behind the fixed bottom tab bar. The dvh cap keeps the
        // whole dialog on screen (16px outer p-4 + 48px mt-12 above, ~76px
        // clear below) and the safe-area bottom padding keeps the last row
        // tappable above the home indicator.
        className="lv-enter mt-12 max-h-[calc(100dvh-140px)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-[var(--r)] border border-[rgba(216,224,229,.16)] bg-[#12181d] px-5 pt-5 pb-[calc(20px+env(safe-area-inset-bottom))] text-[#d8e0e5] shadow-xl outline-none"
      >
        <h3 className="mb-3 font-serif text-[20px] font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  )
}
