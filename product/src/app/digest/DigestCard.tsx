import type { ReactNode } from 'react'
import Image from 'next/image'

// The shell every digest link page renders (LIVHOLD frames 31–32). Standalone
// by design: no app nav, no account — the visitor arrives straight from a mail
// client and may never have opened the app. Sits on the 2b landscape wash (the
// "hands you something finished" grammar from the handoff README).

export function DigestCard({
  tripName,
  title,
  children,
  actions,
  footnote,
}: {
  tripName?: string
  title: string
  children?: ReactNode
  actions?: ReactNode
  footnote?: ReactNode
}) {
  return (
    <main
      className="flex min-h-dvh items-center justify-center px-4 py-12"
      style={{ background: 'var(--washLight)', color: 'var(--washInk)' }}
    >
      <div className="lv-enter w-full max-w-md rounded-[calc(var(--r)+2px)] bg-sf p-8 text-center text-tx">
        <Image src="/brand/livhold-mark.png" alt="" width={40} height={40} className="mx-auto" aria-hidden />
        {tripName && (
          <div className="mt-3 text-base uppercase tracking-[.12em] text-tx2">
            {tripName}
          </div>
        )}
        <h1 className="mt-2 font-serif text-2xl font-semibold leading-[1.25]">{title}</h1>
        <div className="mt-3 space-y-2.5 text-base leading-[1.55] text-tx2">
          {children}
        </div>
        {actions && <div className="mt-6 flex flex-col items-center gap-3">{actions}</div>}
        {footnote && (
          <div className="mt-6 border-t border-ln pt-4 text-base leading-[1.5] text-tx3">
            {footnote}
          </div>
        )}
      </div>
    </main>
  )
}

/** Primary action — always the live page, the one thing they actually came for. */
export function LivePageLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="w-full max-w-[17rem] rounded-[calc(var(--r)-2px)] bg-ac px-5 py-3.5 text-base font-semibold text-on hover:opacity-90"
    >
      Open the live page →
    </a>
  )
}

/** Left-aligned recovery steps for the dead ends, where there is no button to offer. */
export function Recovery({ title, steps }: { title: string; steps: ReactNode[] }) {
  return (
    <div className="mt-5 rounded-[var(--r)] border border-ln2 bg-inp p-4 text-left text-base leading-[1.5] text-tx2">
      <b className="text-tx">{title}</b>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  )
}
