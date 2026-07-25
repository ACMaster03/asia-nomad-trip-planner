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
        glyph="📮"
        tripName={tripName}
        title="You’re still subscribed"
        actions={<LivePageLink href={viewUrl} />}
        footnote="Every summary has a one-click unsubscribe link at the bottom."
      >
        <p>
          Nothing changed after all — {frequency ? `${frequency} ` : ''}summaries will keep
          arriving at <b className="text-neutral-900 dark:text-neutral-100">{email}</b>.
        </p>
      </DigestCard>
    )
  }

  return (
    <DigestCard
      glyph="👋"
      tripName={tripName}
      title="Unsubscribed"
      actions={
        <>
          <LivePageLink href={viewUrl} />
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
            className="w-full max-w-[17rem] rounded-lg border border-neutral-300 px-5 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {pending ? 'One moment…' : 'Actually, keep sending them'}
          </button>
          {failed && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Couldn’t switch them back on. Re-subscribe from the live page instead.
            </p>
          )}
        </>
      }
      footnote="Changed your mind later? Re-subscribe from the live page any time."
    >
      <p>
        No more email summaries will be sent to{' '}
        <b className="text-neutral-900 dark:text-neutral-100">{email}</b>.
      </p>
      <p>
        The live page still works — unsubscribing only stops the emails, it doesn’t take away
        your access.
      </p>
    </DigestCard>
  )
}
