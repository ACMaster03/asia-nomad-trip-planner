'use client'

import { useState, useTransition } from 'react'
import { DigestCard, LivePageLink } from './DigestCard'
import { undoUnsubscribe } from './actions'
import type { Frequency } from '@/lib/digest/api'

// Client-side because the undo has to replace the WHOLE card: leaving
// "no more summaries will be sent" on screen above "back on" reads as a
// contradiction, and on a confirmation screen that is exactly the wrong doubt
// to leave someone with.

export default function UnsubscribedCard({
  token,
  email,
  tripName,
  viewUrl,
  frequency,
}: {
  token: string
  email: string
  tripName: string
  viewUrl: string
  frequency?: Frequency
}) {
  const [pending, startTransition] = useTransition()
  const [undone, setUndone] = useState(false)
  const [failed, setFailed] = useState(false)

  if (undone) {
    return (
      <DigestCard
        tripName={tripName}
        title="You’re still subscribed"
        actions={<LivePageLink href={viewUrl} />}
        footnote="Every summary has a one-click unsubscribe link at the bottom."
      >
        <p>
          Nothing changed after all — {frequency ? `${frequency} ` : ''}summaries will keep
          arriving at <b className="text-tx">{email}</b>.
        </p>
      </DigestCard>
    )
  }

  // Frame 32: undo is the mauve-outlined hero, the live page rides along as a
  // quiet text link underneath.
  return (
    <DigestCard
      tripName={tripName}
      title="Unsubscribed"
      actions={
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const status = await undoUnsubscribe(token)
                if (status === 'resubscribed') setUndone(true)
                else setFailed(true)
              })
            }
            className="w-full max-w-[17rem] rounded-[calc(var(--r)-2px)] border-[1.5px] border-ac2 px-5 py-3 text-base font-semibold text-ac2 hover:bg-ac2-soft disabled:opacity-50"
          >
            {pending ? 'One moment…' : 'Actually, keep sending them'}
          </button>
          <a href={viewUrl} className="text-base font-semibold text-tx2 hover:text-tx">
            Open the live page →
          </a>
          {failed && (
            <p className="text-base text-warn">
              Couldn’t switch them back on. Re-subscribe from the live page instead.
            </p>
          )}
        </>
      }
      footnote="Changed your mind later? Re-subscribe from the live page any time."
    >
      <p>
        No more email summaries will be sent to <b className="text-tx">{email}</b>.
      </p>
      <p>
        The live page still works — unsubscribing only stops the emails, it doesn’t take away
        your access.
      </p>
    </DigestCard>
  )
}
