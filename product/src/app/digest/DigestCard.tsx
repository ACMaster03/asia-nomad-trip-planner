import type { ReactNode } from 'react'

// The shell every digest link page renders (mock 11). Standalone by design:
// no app nav, no account — the visitor arrives straight from a mail client and
// may never have opened the app.

export function DigestCard({
  glyph,
  tripName,
  title,
  children,
  actions,
  footnote,
}: {
  glyph: string
  tripName?: string
  title: string
  children?: ReactNode
  actions?: ReactNode
  footnote?: ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="text-5xl leading-none">{glyph}</div>
        {tripName && (
          <div className="mt-3 text-xs uppercase tracking-wide text-neutral-400 dark:text-neutral-600">
            {tripName}
          </div>
        )}
        <h1 className="mt-3 text-xl font-semibold">{title}</h1>
        <div className="mt-2 space-y-2.5 text-sm text-neutral-600 dark:text-neutral-400">
          {children}
        </div>
        {actions && <div className="mt-6 flex flex-col items-center gap-2.5">{actions}</div>}
        {footnote && (
          <div className="mt-6 border-t border-neutral-200 pt-4 text-xs text-neutral-400 dark:border-neutral-800 dark:text-neutral-600">
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
      className="w-full max-w-[17rem] rounded-lg bg-teal-600 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700"
    >
      Open the live page →
    </a>
  )
}

/** Left-aligned recovery steps for the dead ends, where there is no button to offer. */
export function Recovery({ title, steps }: { title: string; steps: ReactNode[] }) {
  return (
    <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-left text-[13px] text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-400">
      <b className="text-neutral-900 dark:text-neutral-100">{title}</b>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  )
}
