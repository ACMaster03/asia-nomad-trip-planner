import type { ReactNode } from 'react'

// A card's small uppercase title (the phone's CardLabel, MoneyScreen.swift):
// 11.5 px semibold small capitals, mauve on the cards the page titles in
// mauve, the quiet grey otherwise.
export const cardLabelCls = (mauve = false) =>
  'text-[11.5px] font-semibold uppercase tracking-[.113em] ' + (mauve ? 'text-ac2' : 'text-tx3')

export function CardLabel({ children, mauve = false, className = '' }: { children: ReactNode; mauve?: boolean; className?: string }) {
  return <div className={cardLabelCls(mauve) + (className ? ' ' + className : '')}>{children}</div>
}
