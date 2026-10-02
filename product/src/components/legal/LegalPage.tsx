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
 * A <span>, not a fragment, so the value is an element of its own rather than
 * a text node glued to the page's text with React's <!-- --> marker; it keeps
 * the HTML plain and the spaces around it ordinary. The legal pages also use
 * no {' '}: a space is always part of a text run. Neither was the cause of
 * "so theUK GDPR" in Safari (that was the body's tabular figures, see the
 * article below), but both keep the markup simple. One rule that IS a cause:
 * a text run that begins with a space must not contain an &apos;, because the
 * compiler drops that leading space; such runs are plain strings, {" … "}.
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
          read simpler, but iOS Safari ignores it; a fixed element does not.
          h-lvh, not inset-0: iPhone Safari's address bar shrinks and grows as
          you scroll, the viewport with it, and a layer sized to the viewport
          resized too, so the bottom-anchored hills jumped (Petra, 2 Oct). The
          large viewport height stays put. */}
      <div aria-hidden className="fixed inset-x-0 top-0 -z-10 h-lvh" style={{ background: 'var(--washLight)' }} />
      {/* normal-nums: the body sets tabular figures app-wide, and in Safari that
          setting, with Work Sans, draws the space before an inline element
          (<b>, <span>, <a>) with no width: "so theUK GDPR", "write toprivacy@…"
          (Petra, 2 Oct 2026; with Lora the same space comes out far too wide).
          Prose has no columns of figures to line up, so the legal pages switch
          it off. The app's numeric screens still rely on the body setting. */}
      <article className="lv-enter mx-auto w-full max-w-2xl rounded-[calc(var(--r)+2px)] bg-sf p-6 normal-nums text-tx sm:p-8">
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
