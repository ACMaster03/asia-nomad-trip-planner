import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalValue, Section } from '@/components/legal/LegalPage'
import { LEGAL } from '@/lib/legal/entity'

// Account deletion request page — a Google Play REQUIREMENT, not a nicety.
//
// Play's User Data policy says an app that lets people create an account must
// offer deletion two ways: inside the app, AND at a public web URL that works
// with no sign-in and no install, because someone who has already removed the
// app still has to be able to ask. The in-app half has existed since migration
// 26 (Account → Delete account); this is the half that was missing, and the URL
// goes in the Data safety form.
//
// DELIBERATELY NOT A BUTTON. This page explains and routes; it does not delete.
// An unauthenticated endpoint that erases an account on request is an account
// takeover with extra steps — anyone who knows an address could destroy that
// person's trip, with no undo, because delete_my_account keeps no tombstone.
// Play asks that a request be possible without signing in; it does not ask for
// the deletion itself to be unauthenticated. So: the real button lives behind
// the session, and the identity-checked email route covers anyone locked out.

export const metadata: Metadata = {
  title: 'Delete your account · Livhold',
  description: 'How to delete your Livhold account and everything stored with it.',
}

export default function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your account"
      intro={
        <>
          <p>
            You can erase your {LEGAL.product} account and everything in it. There are two ways, and
            the first is instant.
          </p>
        </>
      }
    >
      <Section id="in-app" title="From inside the app (takes a minute)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Sign in at{' '}
            <Link href="/login" className="font-medium text-ac2-deep underline">
              {LEGAL.origin.replace(/^https:\/\//, '')}
            </Link>
            .
          </li>
          <li>
            Open <span className="font-medium text-tx">Account</span>.
          </li>
          <li>
            Scroll to <span className="font-medium text-tx">Delete account</span> and type the
            confirmation phrase it asks for.
          </li>
        </ol>
        <p>
          It happens immediately. There is no confirmation email, no waiting period and no support
          queue.
        </p>
      </Section>

      <Section id="by-email" title="If you cannot sign in">
        <p>
          Write to <LegalValue value={LEGAL.contactEmail} /> from the email address the account uses
          and ask for it to be deleted. We will confirm it is your address before erasing anything,
          which is the whole reason this page is not a button, and complete the deletion within 30
          days, usually far sooner.
        </p>
      </Section>

      <Section id="what-goes" title="What is erased">
        <ul className="list-disc space-y-1 pl-5">
          <li>Every trip you own: the itinerary, stays, transport, notes, check-ins and money entries.</li>
          <li>The photos attached to those trips.</li>
          <li>Your place on trips somebody else owns. Their trip survives; you are simply no longer on it.</li>
          <li>Your follow links, which stop working for everyone holding them.</li>
          <li>Your push notification registrations.</li>
          <li>Your sign-in, including your password if you set one.</li>
        </ul>
        <p>
          <b className="font-semibold text-tx">
            Nothing is retained, nothing is archived, and there is no undo.
          </b>{' '}
          We keep no backup copy we could restore you from, so export anything you want to keep
          before you do this. The app writes your trip and all your money entries out as files.
        </p>
        <p>
          A trip owned by someone else that you had joined is theirs, and stays. If you want your
          contributions out of it as well, ask its owner.
        </p>
        <p className="pt-1">
          The{' '}
          <Link href="/privacy#retention" className="font-medium text-ac2-deep underline">
            Privacy Policy
          </Link>{' '}
          covers what is stored in the first place.
        </p>
      </Section>
    </LegalPage>
  )
}
