'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

// The phone's grouped settings list (TripSettings.swift, AccountView.swift:
// SwiftUI's inset grouped List), round 5: a small title over a white card of
// rows, a line of small print under it. A row is a label on the left and its
// value or control on the right; a field saves when it is left (decision 5),
// so there is no Save button anywhere on these screens.

export function Group({ title, footer, children, className = '' }: {
  title?: string
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      {title && <h2 className="mb-1.5 px-4 text-[13px] font-medium uppercase tracking-[.06em] text-tx2">{title}</h2>}
      <div className="divide-y divide-ln rounded-[var(--r)] bg-sf px-4">{children}</div>
      {footer && <div className="mt-1.5 px-4 text-[13px] leading-snug text-tx2">{footer}</div>}
    </section>
  )
}

export const rowCls = 'flex min-h-[50px] items-center justify-between gap-3 py-2 text-base text-tx'

/** A label and, on the right, whatever the row holds. */
export function Row({ label, children, className = '' }: { label: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={rowCls + ' ' + className}>
      <span className="flex-none">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right text-tx2">{children}</span>
    </div>
  )
}

/** A row that opens another screen: the value in grey, a chevron. */
export function RowLink({ label, value, href, valueClass = 'text-tx2' }: { label: React.ReactNode; value?: React.ReactNode; href: string; valueClass?: string }) {
  return (
    <Link href={href} className={rowCls}>
      <span className="flex-none">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
        {value && <span className={'truncate ' + valueClass}>{value}</span>}
        <ChevronRight aria-hidden className="size-4 flex-none text-tx3" strokeWidth={2.4} />
      </span>
    </Link>
  )
}

/**
 * A text field on the right of its row that saves when it is left (blur, or
 * Enter on a keyboard). What is typed lives here until then, so a newer copy of
 * the journey arriving meanwhile cannot overwrite the keystrokes; afterwards the
 * row shows what the journey holds.
 */
export function RowInput({ label, value, onSave, placeholder, suffix, inputMode, disabled, ariaLabel }: {
  label: React.ReactNode
  value: string
  onSave: (value: string) => void
  placeholder?: string
  /** "Ft" after the budget */
  suffix?: string
  inputMode?: 'text' | 'numeric' | 'decimal'
  disabled?: boolean
  ariaLabel?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label className={rowCls}>
      <span className="flex-none">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <input
          aria-label={ariaLabel}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={draft ?? value}
          onFocus={() => setDraft(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const typed = draft
            setDraft(null)
            if (typed !== null && typed !== value) onSave(typed)
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="min-w-0 flex-1 bg-transparent text-right text-base text-tx outline-none placeholder:text-tx3 disabled:opacity-60"
        />
        {suffix && <span className="flex-none text-tx3">{suffix}</span>}
      </span>
    </label>
  )
}
