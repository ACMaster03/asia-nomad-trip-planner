'use client'
import { useEffect, useRef } from 'react'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden' // lock background scroll
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

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
