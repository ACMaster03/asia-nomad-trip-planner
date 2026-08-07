import type { Metadata } from 'next'
import { unsubscribeDigest } from '@/lib/digest/api'
import { DigestCard } from '../DigestCard'
import UnsubscribedCard from '../UnsubscribedCard'

// The human arm of unsubscribing. The machine arm is POST /api/digest/unsubscribe
// (RFC 8058 one-click), which mail clients call without ever showing a page.

export const metadata: Metadata = {
  title: 'Unsubscribed',
  robots: { index: false },
}

// Visiting this page IS the unsubscribe — never cache it.
export const dynamic = 'force-dynamic'

export default async function UnsubscribePage(
  { searchParams }: { searchParams: Promise<{ t?: string }> },
) {
  const { t } = await searchParams
  const result = t ? await unsubscribeDigest(t) : ({ status: 'unknown' } as const)

  if (result.status === 'error') {
    return (
      <DigestCard
        title="Something went wrong"
        footnote="Still stuck after a few tries? Reply to the email that brought you here."
      >
        <p>
          We couldn’t reach the trip just now.{' '}
          <b className="text-tx">You may still receive the next summary.</b>
        </p>
        <p>Try the link from your email again in a minute.</p>
      </DigestCard>
    )
  }

  // Unknown token — already unsubscribed, or the link is junk. Report success
  // either way: an unsubscribe link that says "not valid" is a broken promise.
  // There is just no trip to name and no live page to offer.
  if (result.status === 'unknown') {
    return (
      <DigestCard title="Unsubscribed">
        <p>No more email summaries will be sent to this address.</p>
        <p>If you asked for this more than once, it only had to happen the first time.</p>
      </DigestCard>
    )
  }

  return (
    <UnsubscribedCard
      token={t!}
      email={result.email}
      tripName={result.tripName}
      viewUrl={result.viewUrl}
      frequency={result.frequency}
    />
  )
}
