import type { Metadata } from 'next'
import { confirmDigest } from '@/lib/digest/api'
import { DigestCard, LivePageLink, Recovery } from '../DigestCard'

// Public page, deliberately OUTSIDE the (app) group — the visitor has no
// account. Replaces the raw *.supabase.co function URL the emails used to
// carry, which rendered four unstyled lines and dead-ended on expiry.

export const metadata: Metadata = {
  title: 'Confirm email updates',
  robots: { index: false }, // the token in the URL is the credential
}

// The token must be read fresh on every request — this call mutates.
export const dynamic = 'force-dynamic'

export default async function ConfirmPage(
  { searchParams }: { searchParams: Promise<{ t?: string }> },
) {
  const { t } = await searchParams
  const result = t ? await confirmDigest(t) : ({ status: 'invalid' } as const)

  if (result.status === 'error') {
    return (
      <DigestCard
        glyph="⚠️"
        title="Something went wrong"
        footnote="Still stuck after a few tries? Reply to the email that brought you here."
      >
        <p>
          We couldn’t reach the trip just now.{' '}
          <b className="text-neutral-900 dark:text-neutral-100">
            Nothing about your subscription changed.
          </b>
        </p>
        <p>Try the link from your email again in a minute.</p>
      </DigestCard>
    )
  }

  if (result.status === 'invalid') {
    // No row matched, so there is genuinely nothing to look up: not the trip,
    // not the address, not a live link. Recovery is text — offering an "open
    // the live page" button here would mean guessing which trip they meant.
    return (
      <DigestCard
        glyph="⏳"
        title="This confirmation link has expired"
        footnote="Nothing was sent to you and nothing was changed."
      >
        <p>
          Confirmation links work once. This one was already used, replaced by a newer
          request, or the subscription was cancelled.
        </p>
        <Recovery
          title="To start getting emails again"
          steps={[
            <>
              Open your follow link — the live page your family sent you. It’s also in the
              confirmation email, under the confirm button.
            </>,
            <>
              Scroll to <b>Get email updates</b> at the bottom.
            </>,
            <>Enter your address again — a fresh confirmation arrives in a minute.</>,
          ]}
        />
      </DigestCard>
    )
  }

  const already = result.status === 'already'
  return (
    <DigestCard
      glyph={already ? '✅' : '🎉'}
      tripName={result.tripName}
      title={already ? 'Already confirmed' : 'You’re in'}
      actions={<LivePageLink href={result.viewUrl} />}
      footnote="Every summary has a one-click unsubscribe link at the bottom."
    >
      {already ? (
        <p>
          <b className="text-neutral-900 dark:text-neutral-100">{result.email}</b> is already
          signed up for <b className="text-neutral-900 dark:text-neutral-100">{result.frequency}</b>{' '}
          updates. Nothing changed.
        </p>
      ) : (
        <>
          <p>
            You’ll get a{' '}
            <b className="text-neutral-900 dark:text-neutral-100">{result.frequency}</b> email
            summary of the trip at{' '}
            <b className="text-neutral-900 dark:text-neutral-100">{result.email}</b>.
          </p>
          <p>
            Quiet {result.frequency === 'weekly' ? 'weeks' : 'days'} send nothing at all — the
            next email just covers a longer stretch.
          </p>
        </>
      )}
    </DigestCard>
  )
}
