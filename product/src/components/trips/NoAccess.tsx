import Link from 'next/link'
import { DoorClosed } from 'lucide-react'

// The permission-denied endframe (LIVHOLD frame 35): what a viewer gets when
// they reach a screen that only travellers can use (today: /live), typically
// by opening a URL someone pasted them rather than by tapping anything.
//
// Deliberately NOT a 404 and not a redirect: pretending the screen doesn't
// exist makes the app look broken to someone who was legitimately invited. Say
// what happened, say what they CAN do, and give them one tap to get there.
// (The read-only banner under it is ViewerNotice's job, not this card's.)
export function NoAccess({
  title = 'This screen is for the travellers on this trip',
  detail = 'Check-ins are made from here by the people travelling. Follow the plan and the feed from the dashboard or the itinerary instead.',
}: {
  title?: string
  detail?: string
}) {
  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="lv-enter rounded-[calc(var(--r)+2px)] bg-sf p-6 text-center text-tx">
        <DoorClosed size={30} strokeWidth={2} className="mx-auto text-ac2" aria-hidden />
        <h1 className="mt-3 font-serif text-[22px] font-semibold leading-[1.3]">{title}</h1>
        <p className="mt-2.5 text-base leading-[1.55] text-tx2">{detail}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <Link
            href="/dashboard"
            className="rounded-[calc(var(--r)-3px)] bg-ac px-4 py-3 text-base font-semibold text-on"
          >
            Go to the dashboard
          </Link>
          <Link
            href="/itinerary"
            className="rounded-[calc(var(--r)-3px)] border-[1.5px] border-ac2 px-4 py-3 text-base font-semibold text-ac2"
          >
            View the itinerary
          </Link>
        </div>
      </div>
    </main>
  )
}
