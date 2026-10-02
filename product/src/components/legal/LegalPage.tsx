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
 *
 * A <span>, not a fragment. A fragment's text lands next to the page's own
 * text, and React separates adjacent text nodes with an invisible <!-- -->,
 * next to which at least one browser drops the space (Petra, 2 Oct 2026:
 * "write toprivacy@…", "so theUK GDPR"). An element has no such marker. For
 * the same reason the legal pages never use {' '}: a space is always part of
 * a text run, never a child of its own. And a text run that begins with a
 * space must not contain an &apos; (the compiler drops that leading space);
 * such runs are written as plain strings, {" … "}.
 */
export function LegalValue({ value }: { value: string }) {
  if (!isUnset(value)) return <span>{value}</span>
  return (
    <mark className="rounded bg-warn-soft px-1 font-semibold text-warn">
      [{value.replace(/^TODO_/, '').replace(/_/g, ' ').toLowerCase()}: not set yet]
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
    <main className="relative isolate min-h-dvh px-6 pb-16 pt-10" style={{ color: 'var(--washInk)' }}>
      {/* The wash sits on a fixed, screen-sized layer rather than on the page.
          These pages run to five screens, and `cover` on the page stretched a
          phone-sized picture (576 px wide) to that height: zoomed in and
          pixelated (Petra, 2 Oct 2026). Pinned to the screen it covers one
          screen, as on the sign-in page. `background-attachment: fixed` would
          read simpler, but iOS Safari ignores it; a fixed element does not. */}
      <div aria-hidden className="fixed inset-0 -z-10" style={{ background: 'var(--washLight)' }} />
      <article className="lv-enter mx-auto w-full max-w-2xl rounded-[calc(var(--r)+2px)] bg-sf p-6 text-tx sm:p-8">
        <Link href="/login" className="text-base font-medium text-ac2-deep underline">
          ← Back to sign in
        </Link>

        <h1 className="mt-5 font-serif text-[30px] font-semibold leading-[1.2]">{title}</h1>
        <p className="mt-1.5 text-base text-tx3">
          <span>{`Last updated ${LEGAL.lastUpdated} · `}</span>
          <LegalValue value={LEGAL.entity} />
        </p>

        <div className="mt-4 flex flex-col gap-2.5 text-base leading-relaxed text-tx2">{intro}</div>

        {children}

        <hr className="mt-8 border-ln" />
        <p className="mt-4 text-base leading-relaxed text-tx3">
          Questions about any of this go to <span className="font-medium text-tx2">
            <LegalValue value={LEGAL.contactEmail} />
          </span>
          .
        </p>
      </article>
    </main>
  )
}
