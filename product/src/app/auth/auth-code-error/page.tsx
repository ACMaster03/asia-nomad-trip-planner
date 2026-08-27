import Link from 'next/link'
import { Hourglass } from 'lucide-react'

// Auth error — handoff frame 03: centered card on the 2b wash.
//
// The card keeps its calm wording, but a failure now says WHY underneath when
// the callback passes a reason. "Invalid or expired" hides two opposite
// problems: a genuinely stale link, and a PKCE code verifier that was never in
// this browser (the link was opened from a mail app's in-app browser rather
// than the browser that asked for it). The second one is not the reader's
// fault and is not fixed by requesting a fresh link — so saying so matters.

export const dynamic = 'force-dynamic'

// GoTrue's own phrasing for "this browser never held the verifier".
function isCrossBrowser(reason: string): boolean {
  return /code verifier|code_verifier|non-empty/i.test(reason)
}

export default async function AuthCodeError(
  { searchParams }: { searchParams: Promise<{ reason?: string }> },
) {
  const { reason } = await searchParams
  const crossBrowser = !!reason && isCrossBrowser(reason)

  return (
    <main
      className="flex min-h-dvh flex-col justify-center px-6 py-7"
      style={{ background: 'var(--washLight)', color: 'var(--washInk)' }}
    >
      <div className="mx-auto w-full max-w-sm rounded-[calc(var(--r)+2px)] bg-sf px-6 py-7 text-center text-tx">
        <Hourglass aria-hidden className="mx-auto size-9" strokeWidth={2} />
        <h1 className="mt-3 text-[22px] font-semibold leading-tight">
          {crossBrowser ? 'Opened in the wrong browser' : 'Sign-in link invalid or expired'}
        </h1>
        <p className="mt-2.5 text-base leading-relaxed text-tx2">
          {crossBrowser ? (
            <>
              This link has to finish in the same browser that asked for it. Copy it and paste it
              into the browser where you typed your email.
            </>
          ) : (
            <>The magic link couldn&apos;t be verified. Request a fresh one.</>
          )}
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-[calc(var(--r)-2px)] border-[1.5px] border-ac2 px-[22px] py-[13px] text-base font-semibold text-ac2"
        >
          Back to sign in
        </Link>
        {reason && (
          <p className="mt-5 break-words border-t border-ln2 pt-4 text-[13px] leading-normal text-tx3">
            {reason}
          </p>
        )}
      </div>
    </main>
  )
}
