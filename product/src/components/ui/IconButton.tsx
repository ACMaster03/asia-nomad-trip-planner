import Link from 'next/link'
import type { ReactNode } from 'react'

// A 44px round button holding one icon, as the phone's IconButtonStyle
// (ios/Livhold/Components/Buttons.swift): the surface colour, a hairline
// border, the icon at 18 in the secondary text colour. Trip's gear, the "…" on a
// journey you follow. Renders a link when given `href`, a button otherwise.
export const iconButtonCls = 'flex size-11 flex-none items-center justify-center rounded-full border border-ln2 bg-sf text-tx2'

export function IconButton({
  href,
  label,
  onClick,
  children,
  className = '',
}: {
  href?: string
  /** The accessible name; the icon says nothing on its own. */
  label: string
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  const cls = iconButtonCls + (className ? ' ' + className : '')
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={cls}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cls}>
      {children}
    </button>
  )
}
