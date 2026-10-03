import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalValue, Section } from '@/components/legal/LegalPage'
import { LEGAL } from '@/lib/legal/entity'

// Privacy Policy. Public, unauthenticated, and required before this app can be
// listed on Google Play at all.
//
// EVERY CLAIM HERE IS TRACEABLE TO THE CODE, and that is the property to keep:
// a policy that drifts from what the app does is worse than no policy, and the
// Play Data Safety form is a SECOND declaration of the same facts — the two are
// compared, and a mismatch is a rejection. When the app starts collecting
// something new, this page and that form change in the same breath.
//
// Sources for the current text, so a future edit can re-check rather than
// re-guess:
//   supabase/schema.sql + migrations   what is stored, column by column
//   lib/trips/media.ts                 the canvas re-encode that drops EXIF
//   migration 12                       trip-media is a PUBLIC bucket
//   migration 26                       delete_my_account: no undo, no tombstone
//   supabase/functions/_shared/resend  transactional email leaves via Resend
//   product/vercel.json                functions pinned to dub1 (Dublin)
//   (absent) navigator.geolocation     the app never asks the device where it is
//                                      (but itinerary cities and check-ins ARE the
//                                      user's location at city level: said so)
//   (absent) any analytics SDK         no third party measures the reader
//   #120 (usage counts, own database)  follower opens per day, sign-up source,
//                                      setup steps; described here ahead of the
//                                      code by Patrik's decision (3 Oct 2026)
//   auth.sessions (Supabase Auth)      IP and user agent per signed-in session;
//   migration 42                       purge-idle-sessions deletes it after 90 days idle
//   migration 44 + api/journey-signup  the list form on journey.livhold.com:
//                                      what it stores, insert-only, 12-month purge

export const metadata: Metadata = {
  title: 'Privacy Policy · Livhold',
  description: 'What Livhold stores, who else can see it, and how to get rid of it.',
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <>
          <p>
            <span>{LEGAL.product}</span> is a trip planner. You put an itinerary, what you spend and what you
            see into it, and you choose who else gets to look. This page is the plain account of
            what that means for your data.
          </p>
          <p>
            The service is operated by <LegalValue value={LEGAL.entity} />, <LegalValue value={LEGAL.address} />,
            which is the data controller for it.
          </p>
        </>
      }
    >
      <Section id="what-we-collect" title="What we store">
        <p>Nothing here is inferred or bought. All of it is either needed to sign you in, or something you typed.</p>
        <p className="font-semibold text-tx">Your account</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your email address: it is how you sign in and how a trip is shared with you by name.</li>
          <li>
            A password, only if you set one. It is stored hashed by our authentication provider and
            is never visible to us or to you again.
          </li>
          <li>A first name, if you give one, so your name rather than your address appears to people you plan with.</li>
          <li>
            When you sign in, the address your connection comes from and the kind of browser or app
            you use, kept until you sign out on that device or stop using the app on it for 90 days. The services we run on also keep ordinary request
            logs for a short time, for security and to find faults; nobody reads them per person.
          </li>
        </ul>
        <p className="font-semibold text-tx">What you put in a trip</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>The itinerary: countries, cities, arrival and departure dates, and your own notes on each.</li>
          <li>Stays and transport: names, booking links, prices, dates, and whatever you wrote in the notes.</li>
          <li>
            Money: income and expense entries (date, category, amount, currency and your note on
            each). This is financial information about you, and it is the most private thing in the
            app. It is never shown to followers.
          </li>
          <li>Check-ins: the place, a rating, your comment, and when it happened.</li>
          <li>Photos you attach to a check-in.</li>
        </ul>
        <p>
          Put together, the cities in your itinerary and your check-ins say where you are, at the
          level of a city, and when. That is your location in the ordinary sense, and we treat it
          that way: it comes from what you chose to enter, never from your device, and followers
          see only what you share with them.
        </p>
        <p className="font-semibold text-tx">Sharing</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Who you invited to a trip and whether they can edit or only view.</li>
          <li>
            The follow links you created. The link itself is stored hashed, and we keep the first six
            characters so you can tell your links apart in the list, and nothing more.
          </li>
        </ul>
        <p className="font-semibold text-tx">Notifications</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            If you turn on push, the address your browser gives us for your device plus the keys
            needed to encrypt a message to it. It identifies a browser on a device, not you.
          </li>
        </ul>
        <p className="font-semibold text-tx">How the app is used</p>
        <p>
          To develop {LEGAL.product} and to check whether it works for the people using it, we count
          a few things in our own database:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            The days a journey&apos;s feed was opened by its followers: one mark per follower, or per
            follow link, per day, never each tap or what was looked at.
          </li>
          <li>
            How you found {LEGAL.product} when you signed up: a follow link (and the journey it led to),
            an invitation from a travel partner, the list on journey.livhold.com, or none of these.
          </li>
          <li>Which steps of setting up a journey you have completed.</li>
        </ul>
        <p>
          If you open a follow link without an account, the mark belongs to the link, not to you:
          it records that the link was opened that day, and nothing that identifies who opened it.
          The daily marks are deleted after 12 months. How you signed up and your setup steps stay
          with your account and go when it is deleted. None of it is sold, shared, or sent to an
          analytics company.
        </p>
      </Section>

      <Section id="journey-list" title="If you join the list on journey.livhold.com">
        <p>
          The form on journey.livhold.com asks when you&apos;re leaving, for how long, how you plan
          today, your email and, if you like, your first name. If you tick the box, it also notes
          that you&apos;re happy to have a 20-minute call.
        </p>
        <p>
          We use this for three things only: to email you when Livhold opens to everyone, to
          understand how people plan long trips, and, only if you ticked the box, to get in touch
          about a call. We don&apos;t use it for advertising, we don&apos;t sell it, and we
          don&apos;t add you to anything else.
        </p>
        <p>
          We&apos;re allowed to hold it because you gave it to us for these reasons (your consent).
          You can withdraw that consent at any time: use the unsubscribe link in any email, or
          write to <LegalValue value={LEGAL.contactEmail} /> and we will delete your answers.
        </p>
        <p>
          If we talk on a call, we take short written notes. We don&apos;t record calls unless we
          ask you first and you say yes.
        </p>
      </Section>

      <Section id="what-we-dont" title="What we do not collect">
        <p>This list is as much the point as the one above it.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b className="font-semibold text-tx">Not your device&apos;s location.</b> The app never
            asks your device where it is: no GPS, no Wi-Fi or cell positioning. A check-in is placed
            by the city you picked, not by where your phone is.
          </li>
          <li>
            <b className="font-semibold text-tx">Not the location in your photos.</b>
            {/* a plain string: this run starts with a space and holds an apostrophe, see LegalValue */}
            {" Photos are re-encoded on your phone before upload, which discards the camera's embedded data (GPS coordinates, camera model, timestamp), so what leaves your device is the picture and nothing else."}
          </li>
          <li>
            <b className="font-semibold text-tx">No analytics service and no tracking.</b> The
            counts above are kept in our own database. There is no analytics company, no advertising
            identifier, no third-party tracker and no cookie banner, because there is nothing to
            consent to. The only cookies are the ones that keep you signed in.
          </li>
          <li>
            <b className="font-semibold text-tx">No payment details.</b> The app takes no money, so
            it holds no card.
          </li>
          <li>
            <b className="font-semibold text-tx">Nothing is sold or shared for advertising.</b> Ever.
          </li>
        </ul>
      </Section>

      <Section id="why" title="Why we are allowed to hold it">
        <p>
          Your account and your trip content are processed to provide the service you asked for, which is
          performing our agreement with you. So are reminders about your own bookings, a stay&apos;s
          cancel-by date or a subscription charge, which go to your email; you can switch them off in
          your notification settings. Push notifications and the follower digests are processed on
          consent: nothing is sent until someone switches it on, and a single tap switches it back
          off.
        </p>
        <p>
          The sign-in records, the request logs and the usage counts rest on our legitimate
          interests: keeping accounts secure, finding faults, and knowing whether the app is
          working well enough to keep building. Each is the smallest record that does the job, and
          you can object to it by writing to <LegalValue value={LEGAL.contactEmail} />.
        </p>
      </Section>

      <Section id="processors" title="Who else touches it">
        <p>The service runs on a small number of providers. Each does one job.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b className="font-semibold text-tx">Supabase</b>: the database, the sign-in system and
            photo storage. Your data lives here, in <LegalValue value={LEGAL.dataRegion} />.
          </li>
          <li>
            <b className="font-semibold text-tx">Vercel</b>: hosting. The server code runs in
            Dublin, Ireland.
          </li>
          <li>
            <b className="font-semibold text-tx">Resend</b>: sends the emails: sign-in links, the
            follower digests and reminders about your own bookings. It handles the address the mail
            is going to.
          </li>
          <li>
            <b className="font-semibold text-tx">Push services</b>: if you turn push on, the
            notification travels through the service your browser uses (Google, Mozilla or Apple,
            depending on the browser), or through Apple&apos;s push service in the iPhone app. The content is encrypted to your
            device.
          </li>
          <li>
            <b className="font-semibold text-tx">For the list on journey.livhold.com</b>: Supabase
            stores the form answers. The email when Livhold opens goes out through <LegalValue value={LEGAL.listEmailTool} />,
            like our other emails. If you ticked the call box, we write to you ourselves, from
            our <LegalValue value={LEGAL.mailbox} /> mailbox, to find a time; there is no booking
            tool. The call runs on <LegalValue value={LEGAL.callTool} />.
          </li>
        </ul>
      </Section>

      <Section id="photos" title="One thing to know about photos">
        <p>
          Photos are stored at web addresses that are impossible to guess, but they are not behind a
          sign-in check. Anyone who has the exact address of a photo can open it. In practice that
          address only ever reaches people you shared the trip with, but it means a photo URL, once
          passed on, keeps working. Treat a photo you upload the way you would treat one you texted
          to somebody.
        </p>
      </Section>

      <Section id="followers" title="If you follow a trip without an account">
        <p>
          A follow link opens for anyone who has it: no account, no sign-in. Follow along and we
          store nothing about you at all.
        </p>
        <p>
          Ask for email digests and we store your email address and whether you confirmed it, so we
          can send them and stop when you say stop. Turn on push and we store your browser&apos;s
          push address in the same way. Every digest carries an unsubscribe link that works in one
          click and needs no account. Unsubscribing stops the emails at once; we keep your address as
          a “do not email” note, so a stale form cannot sign you up again, and we delete that too if
          you write to us.
        </p>
        <p>
          Followers never see money, private notes, bookings or exact positions. They see the route,
          the dates, check-ins and the comments shared with them.
        </p>
      </Section>

      <Section id="retention" title="How long it is kept, and how to end it">
        <p>
          Your content stays until you delete it. Delete a trip and its contents and photos go with
          it. Revoke a follow link and that address stops working immediately for everyone holding
          it.
        </p>
        <p>
          A signed-in device, with the address it connected from, is forgotten when you sign out on
          it, or after 90 days without using the app on it. You then simply sign in again.
        </p>
        <p>
          Deleting your account, from <span className="font-medium text-tx">Account → Delete account</span>,
          removes the trips you own along with their photos, removes your place on trips you had
          joined, and removes your sign-in. <b className="font-semibold text-tx">There is no undo, no grace period and no backup copy we can restore from.</b> We
          say so plainly because the button means it.
        </p>
        <p>
          List answers and call notes are deleted 12 months after you send them, or sooner if you
          ask. If you create a Livhold account, your account follows the rules above instead.
        </p>
      </Section>

      <Section id="rights" title="Your rights">
        <p>
          <LegalValue value={LEGAL.entity} /> is a company registered in the United Kingdom, so
          the <b className="font-semibold text-tx">UK GDPR</b> and the Data Protection Act 2018 apply to
          what it does with your data. The service is also offered to people in the EEA, so
          the <b className="font-semibold text-tx">EU GDPR</b> applies as well. The rights below are the
          same under both.
        </p>
        <p>
          You can ask for a copy of your data, ask for it to be corrected or erased, object to how
          it is processed, ask us to restrict it, or ask for it in a portable form. Erasure you can
          do yourself, instantly: <Link href="/delete-account" className="font-medium text-ac2-deep underline">deleting your account</Link> is
          a real erasure rather than a request that goes into a queue.
        </p>
        <p>
          For a copy of your data, your trip and your money entries as files, or for anything else,
          write to <LegalValue value={LEGAL.contactEmail} /> and we will answer within one month.
        </p>
        <p>
          <b className="font-semibold text-tx">If you are not satisfied</b>, you can complain to the
          UK&apos;s Information Commissioner&apos;s Office (ico.org.uk). If you are in the EEA, you
          can complain to your own country&apos;s data protection authority instead.
        </p>
        <p>
          Our representative in the EU, for the purposes of Article 27 of the EU GDPR,
          is <LegalValue value={LEGAL.euRepresentative} />, <LegalValue value={LEGAL.euRepresentativeAddress} />,
          at <LegalValue value={LEGAL.euRepresentativeEmail} />. People in the EEA may contact our
          representative about anything on this page instead of contacting us directly.
        </p>
      </Section>

      <Section id="transfers" title="Data leaving the UK and the EEA">
        <p>
          The company is in the United Kingdom and the service runs on providers
          in <LegalValue value={LEGAL.dataRegion} />, so your data moves between the UK and the EEA in
          the ordinary course of the service working. Both directions are covered by adequacy
          decisions (the EU recognises the UK, and the UK recognises the EEA), so no extra
          safeguard is needed for that leg.
        </p>
        <p>
          Where a provider is based outside those, it is used under the standard contractual clauses
          its own terms provide.
        </p>
      </Section>

      <Section id="children" title="Children">
        <p>
          This is not a service for children, and it is not directed at them. We do not knowingly
          collect anything from a child under 16. If you believe a child has an account, write to us
          and it will be removed.
        </p>
      </Section>

      <Section id="changes" title="Changes">
        <p>
          If this policy changes in a way that affects what we collect or who sees it, the date at
          the top changes and anyone with an account is told before it takes effect. Small
          corrections are made quietly, and the date still moves.
        </p>
        <p className="pt-1">
          See also the <Link href="/terms" className="font-medium text-ac2-deep underline">Terms of Service</Link>.
        </p>
      </Section>
    </LegalPage>
  )
}
