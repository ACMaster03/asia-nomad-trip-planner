'use client'
import { useEffect, useRef } from 'react'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // onClose is almost always an inline arrow → new identity on every parent
  // render. It must NOT be an effect dependency: re-running the effect stole
  // focus back to the dialog on EVERY keystroke of parent-held form state,
  // which closes the keyboard on iOS (phone dogfood, 2026-07-24).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden' // lock background scroll
    // Focus the dialog for Escape/tab context — but never steal it from a
    // child that already has it (autoFocus fields win).
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
        aria-label={title}
        className="mt-12 w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-5 shadow-xl outline-none dark:border-neutral-800 dark:bg-neutral-950"
      >
        <h3 className="mb-3 text-lg font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  )
}
