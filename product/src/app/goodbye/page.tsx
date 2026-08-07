import Link from 'next/link'

// The receipt for a deleted account (LIVHOLD v1 frame 33).
//
// Deliberately OUTSIDE the authenticated (app) group: by the time this renders
// the session is gone, so an auth-guarded route would bounce straight to /login
// and the person would never see it — which was the old behaviour, and it reads
// as "you got logged out" rather than "it worked".
//
// This is the ONLY confirmation they ever get: delete_my_account (migration 26)
// sends no email and has no undo, so the copy says plainly that nothing is
// recoverable instead of softening it.
//
// A static page with no data of its own — visiting /goodbye directly just shows
// the same words, which is harmless and cheaper than guarding a page that has
// no secrets on it. The counts stay generic on purpose: the rows we would count
// no longer exist by the time this paints.
//
// Sits on the 2b milestone wash, like the personalisation recap — a farewell is
// a milestone too, just a sadder one.
export default function GoodbyePage() {
  return (
    <main
      className="grid min-h-screen place-items-center p-6"
      style={{ background: 'var(--washLight)', color: 'var(--washInk)' }}
    >
      <div className="lv-enter w-full max-w-md rounded-[calc(var(--r)+2px)] bg-sf p-[26px] text-center text-tx">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
        <img src="/brand/livhold-mark.png" alt="Livhold" width={48} height={48} className="mx-auto mb-4" />
        <h1 className="font-serif text-[24px] font-semibold leading-[1.25]">Your account is deleted</h1>
        <p className="mt-1.5 text-base text-tx2">Sorry to see you go.</p>

        <div className="mt-[18px] border-t border-ln pt-4 text-left">
          <p className="text-base font-semibold">What was erased</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-base leading-normal text-tx2">
            <li>the trips you owned, with their photos</li>
            <li>your seat on trips you had joined</li>
            <li>your sign-in</li>
          </ul>
          <p className="mt-3 text-base leading-normal text-tx2">
            Nothing is kept, and there is nothing to restore. You can start fresh with the same
            email whenever you like — it just begins empty.
          </p>
        </div>

        <Link
          href="/login"
          className="mt-[18px] block w-full rounded-[calc(var(--r)-2px)] bg-ac py-3.5 text-base font-semibold text-on"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
