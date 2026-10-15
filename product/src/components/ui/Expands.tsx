import type { ReactNode } from 'react'

// A card part that opens (round 6; the phone's .expands() in its Fade style,
// Motion.swift: "the card grows; its content fades in where it stands"). Wrap
// the part that is rendered only while open; globals.css grows it from nothing
// and fades it in over the quick beat. Closing is at once, as the part unmounts.
export function Expands({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={'lv-expand ' + className}>
      <div>{children}</div>
    </div>
  )
}
