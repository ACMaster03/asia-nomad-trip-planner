import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalValue, Section } from '@/components/legal/LegalPage'
import { LEGAL } from '@/lib/legal/entity'

// Terms of Service. Public and unauthenticated, for the same reason /privacy is.
//
// Play does not demand a Terms page the way it demands a privacy policy, but the
// sign-in screen has always claimed one exists ("By continuing you agree to the
// Terms"), and a link to nothing is the worst version of that sentence. It is
// also where the honest limits live: no uptime promise, no paid tier today, and
// what happens to a trip when an account goes away.
//
// NOT LEGAL ADVICE and not a substitute for review by someone qualified — the
// liability and governing-law sections in particular are the ordinary shape of
// such a clause, written to be readable, not litigated over. See docs/NOTES.md.

export const metadata: Metadata = {
  title: 'Terms of Service · Livhold',
  description: 'The agreement for using Livhold: what you may do, what we promise, and what we do not.',
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <>
          <p>
            These terms are the agreement between you and{' '}
            <LegalValue value={LEGAL.entity} /> for using {LEGAL.product}. Using the service means
            accepting them.
          </p>
          <p>
            They are written to be read. Where something is a genuine limit on what you get, it says
            so rather than burying it.
          </p>
        </>
      }
    >
      <Section id="account" title="Your account">
        <p>
          Anyone with a working email address can create one. The sign-in link we send to that
          address is the only check, which is why it has to be an address you can actually read. You
          are responsible for what happens through your account, including anything done by someone
          you invited or gave a password to.
        </p>
        <p>
          You must be at least 16 to use {LEGAL.product}. Do not create an account for anybody else
          without their knowledge.
        </p>
      </Section>

      <Section id="your-content" title="Your content stays yours">
        <p>
          The itinerary, the notes, the numbers and the photos are yours. We claim no ownership of
          them and no right to use them for anything beyond running the service for you: no
          training, no publishing, no selling.
        </p>
        <p>
          You give us only the permission the service technically needs: to store your content, and
          to show it to the people you chose to show it to. That permission ends when you delete the
          content.
        </p>
        <p>
          You are responsible for having the right to upload what you upload: a photograph with
          someone else in it, most of all.
        </p>
      </Section>

      <Section id="sharing" title="Sharing, and what a follow link really is">
        <p>
          A follow link opens for anyone who has it. There is no sign-in on it, so a link that gets
          forwarded works just as well for whoever receives it. That is the design, and you should
          decide who to send one to on that basis. To share with one named person instead, invite
          them as a Viewer. They have to sign in with that address, and the invitation cannot be
          passed on.
        </p>
        <p>
          You can revoke any link at any time, and it stops working for everyone immediately.
        </p>
      </Section>

      <Section id="acceptable-use" title="What you may not do">
        <ul className="list-disc space-y-1 pl-5">
          <li>Upload anything unlawful, or anything you have no right to share.</li>
          <li>Use the service to harass anyone, or to store content about someone who would object to it.</li>
          <li>Attempt to reach another person&apos;s trip, account or photos.</li>
          <li>Probe, scrape or overload the service, or work around its limits.</li>
        </ul>
        <p>
          An account used this way can be suspended or removed. Where it is safe and lawful to do
          so, we will tell you why.
        </p>
      </Section>

      <Section id="availability" title="What we promise, and what we do not">
        <p>
          {LEGAL.product} is provided as it is. There is no uptime guarantee, no support commitment
          and no promise that a feature present today will be present next month. It is a small
          service, run by a small team, and it is more honest to say that here than to imply
          otherwise.
        </p>
        <p>
          <b className="font-semibold text-tx">Keep your own copy of anything you cannot lose.</b>{' '}
          The app exports your trip and your money ledger as files for exactly this reason. We take
          reasonable care with your data, but a trip you would grieve over belongs in a second place
          as well.
        </p>
        <p>
          The service is free today. If a paid tier ever arrives, existing accounts will be told
          before anything changes, and nothing you already stored will be held behind a new paywall.
        </p>
      </Section>

      <Section id="liability" title="Liability">
        <p>
          To the extent the law allows, we are not liable for indirect or consequential loss, for
          lost profit, or for data you did not keep a copy of. Nothing here limits liability that
          cannot lawfully be limited (including for death, personal injury, or fraud), and nothing
          here takes away the rights you have as a consumer under the law of the country you live
          in.
        </p>
      </Section>

      <Section id="ending" title="Ending it">
        <p>
          You can stop at any time by deleting your account, which erases the trips you own and
          their photos with no undo. The{' '}
          <Link href="/privacy#retention" className="font-medium text-ac2-deep underline">
            Privacy Policy
          </Link>{' '}
          sets out exactly what goes.
        </p>
        <p>
          If a trip you had joined but did not own is deleted by its owner, it goes for you too.
          Export anything you want to keep before that happens.
        </p>
      </Section>

      <Section id="changes" title="Changes and governing law">
        <p>
          These terms can change. If a change matters, anyone with an account is told before it
          takes effect, and the date at the top moves either way.
        </p>
        <p>
          They are governed by the law of <LegalValue value={LEGAL.jurisdiction} />, and its courts
          have jurisdiction, without depriving you of the protection of the mandatory law of where
          you live.
        </p>
        <p className="pt-1">
          See also the{' '}
          <Link href="/privacy" className="font-medium text-ac2-deep underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  )
}
