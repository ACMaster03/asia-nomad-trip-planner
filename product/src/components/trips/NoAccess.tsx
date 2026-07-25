import Link from 'next/link'

// The permission-denied endframe: what a viewer gets when they reach a screen
// that only travellers can use (today: /live), typically by opening a URL
// someone pasted them rather than by tapping anything.
//
// Deliberately NOT a 404 and not a redirect: pretending the screen doesn't
// exist makes the app look broken to someone who was legitimately invited. Say
// what happened, say what they CAN do, and give them one tap to get there.
export function NoAccess({
  title = 'This screen is for the travellers on this trip',
  detail = 'You have view access, so you can follow the plan and the feed — but check-ins can only be made by the trip owner and co-editors.',
}: {
  title?: string
  detail?: string
}) {
  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="text-3xl" aria-hidden>👁️</div>
        <h1 className="mt-2 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{detail}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/dashboard" className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">
            Go to the dashboard
          </Link>
          <Link href="/itinerary" className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
            View the itinerary
          </Link>
        </div>
      </div>
    </main>
  )
}
