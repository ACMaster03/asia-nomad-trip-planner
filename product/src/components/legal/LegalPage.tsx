import Link from 'next/link'
import { LEGAL, isUnset } from '@/lib/legal/entity'

// Shared chrome for /privacy and /terms.
//
// Both are PUBLIC and must stay that way: Google Play requires the privacy
// policy to open for a reviewer who is not signed in and never will be, and a
// crawler has to reach it too. So these live outside the (app) group and are
// excluded from the proxy's session-refresh matcher — there is no session to
// refresh and no secret on the page.
//
// Sits on the light wash like /goodbye rather than the app surface: you arrive
// here from the sign-in screen as often as from inside the app.

/**
 * Renders a company fact, or a loud marker if it has not been filled in yet.
 * A policy that silently prints "TODO_CONTACT_EMAIL" reads as a finished
 * document containing a typo; this reads as unfinished, which is the truth.
 */
export function LegalValue({ value }: { value: string }) {
  if (!isUnset(value)) return <>{value}</>
  return (
    <mark className="rounded bg-warn-soft px-1 font-semibold text-warn">
      [{value.replace(/^TODO_/, '').replace(/_/g, ' ').toLowerCase()} — not set yet]
    </mark>
  )
}

/** A numbered section. Headings are stable so the Terms can cite the Policy. */
export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 scroll-mt-6" id={id}>
      <h2 className="font-serif text-[21px] font-semibold leading-[1.3]">{title}</h2>
      <div className="mt-2 flex flex-col gap-2.5 text-base leading-relaxed text-tx2">{children}</div>
    </section>
  )
}

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string
  intro: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main
      className="min-h-dvh px-6 pb-16 pt-10"
      style={{ background: 'var(--washLight)', color: 'var(--washInk)' }}
    >
      <article className="lv-enter mx-auto w-full max-w-2xl rounded-[calc(var(--r)+2px)] bg-sf p-6 text-tx sm:p-8">
        <Link href="/login" className="text-base font-medium text-ac2-deep underline">
          ← Back to sign in
        </Link>

        <h1 className="mt-5 font-serif text-[30px] font-semibold leading-[1.2]">{title}</h1>
        <p className="mt-1.5 text-base text-tx3">
          Last updated {LEGAL.lastUpdated} · <LegalValue value={LEGAL.entity} />
        </p>

        <div className="mt-4 flex flex-col gap-2.5 text-base leading-relaxed text-tx2">{intro}</div>

        {children}

        <hr className="mt-8 border-ln" />
        <p className="mt-4 text-base leading-relaxed text-tx3">
          Questions about any of this go to{' '}
          <span className="font-medium text-tx2">
            <LegalValue value={LEGAL.contactEmail} />
          </span>
          .
        </p>
      </article>
    </main>
  )
}
