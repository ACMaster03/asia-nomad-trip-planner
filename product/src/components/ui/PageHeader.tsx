import type { ReactNode } from 'react'

// The header every root screen draws itself, as the phone does
// (ios/Livhold/Home/HomeScreen.swift `header`, Trip's `TripHeader`, Money's
// header): a line of small capitals, the serif title, one line under it, and one
// control on the right — the avatar on Home, the gear on Trip, the + on Money.
// The phone's sizes, in px: eyebrow 12.5 (Home's date) or 13 (Trip's kicker),
// title 28 (30 on Money), the line under it 15 (13 on Money).
//
// `tone` is the eyebrow's colour: the deep mauve of Home's date line, or the
// plain mauve of Trip's "DAY 12 · DA LAT, NIGHT 3".
export function PageHeader({
  eyebrow,
  tone = 'deep',
  title,
  titleSize = 28,
  truncate = false,
  sub,
  subSize = 15,
  right,
  className = '',
}: {
  eyebrow?: ReactNode
  tone?: 'deep' | 'mauve'
  title: ReactNode
  titleSize?: 28 | 30
  /** One line, cut with an ellipsis: Trip's name beside its gear. */
  truncate?: boolean
  sub?: ReactNode
  subSize?: 15 | 13
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={'flex items-start justify-between gap-3 ' + className}>
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div
            className={
              tone === 'deep'
                ? 'text-[12.5px] font-medium uppercase tracking-[.128em] text-ac2-deep'
                : 'text-[13px] font-medium uppercase tracking-[.092em] text-ac2'
            }
          >
            {eyebrow}
          </div>
        )}
        <h1
          className={
            'mt-[3px] font-serif font-semibold leading-[1.12] tracking-[-.01em] text-tx ' +
            (titleSize === 30 ? 'text-[30px]' : 'text-[28px]') +
            (truncate ? ' truncate' : '')
          }
        >
          {title}
        </h1>
        {sub && <p className={'mt-[3px] text-tx2 ' + (subSize === 13 ? 'truncate text-[13px]' : 'text-[15px]')}>{sub}</p>}
      </div>
      {right}
    </div>
  )
}
