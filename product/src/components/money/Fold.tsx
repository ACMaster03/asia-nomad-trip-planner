'use client'
import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

// Folded cards: step 2 of a shorter Money (Petra, 24 Sep). Bookings,
// Subscriptions and One-offs & extras show as one line each: a title, a
// summary that carries anything needing attention (a stay not booked, a charge
// due this week, an extra not paid), and ⌄. Tapped, the full card opens in
// place with ⌃ at its top to fold it again. ⌄ opens here, › goes to another
// screen, so the two never look alike.
//
// They start folded each time the app is opened. One opened stays open while
// you move around the app: module state, like the Track question's, so
// leaving Money for All entries and coming back does not fold it again.

const opened = new Set<string>()

export function useFold(key: string): [boolean, () => void] {
  const [open, setOpen] = useState(() => opened.has(key))
  const toggle = () => {
    if (open) opened.delete(key)
    else opened.add(key)
    setOpen(!open)
  }
  return [open, toggle]
}

export function FoldedRow({ title, summary, onOpen, className = '' }: {
  title: string
  summary: ReactNode
  onOpen: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      className={'lv-enter flex w-full items-center justify-between gap-3 rounded-[var(--r)] bg-sf px-[18px] py-3.5 text-left text-tx ' + className}
    >
      <span className="min-w-0">
        <span className="block text-base font-semibold">{title}</span>
        <span className="block text-[14px] text-tx2">{summary}</span>
      </span>
      <ChevronDown aria-hidden className="size-5 flex-none text-ac2" />
    </button>
  )
}

/** The ⌃ at the top of an open card. */
export function FoldButton({ label, onFold }: { label: string; onFold: () => void }) {
  return (
    <button
      type="button"
      onClick={onFold}
      aria-expanded
      aria-label={`Fold ${label}`}
      className="-my-2 -mr-3 flex size-11 flex-none items-center justify-center text-ac2"
    >
      <ChevronUp aria-hidden className="size-5" />
    </button>
  )
}
