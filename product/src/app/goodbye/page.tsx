import Link from 'next/link'

// The receipt for a deleted account (design/mocks/13-account.html, "goodbye").
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
export default function GoodbyePage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center p-6">
      <div className="w-full rounded-lg border border-neutral-200 p-6 text-center dark:border-neutral-800">
        <p aria-hidden className="mb-3 text-4xl">
          👋
        </p>
        <h1 className="text-xl font-semibold">Your account is deleted</h1>
        <p className="mt-1 text-sm text-neutral-500">Sorry to see you go.</p>

        <div className="mt-5 border-t border-neutral-200 pt-4 text-left dark:border-neutral-800">
          <p className="text-sm font-medium">What was erased</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-neutral-600 dark:text-neutral-400">
            <li>the trips you owned, with their photos</li>
            <li>your seat on trips you had joined</li>
            <li>your sign-in</li>
          </ul>
          <p className="mt-3 text-sm text-neutral-500">
            Nothing is kept, and there is nothing to restore. You can start fresh with the same
            email whenever you like — it just begins empty.
          </p>
        </div>

        <Link
          href="/login"
          className="mt-5 inline-block rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
