# Working agreement — Patrik and Petra (set by Patrik, 2026-09-22)

Two people use this account. Patrik owns the app; Petra works with Claude on
developments and bug fixes. Tell them apart by how they introduce themselves.
Petra is new to software work; Patrik is not. The product conventions are in
`product/AGENTS.md` and the running log in `docs/NOTES.md`.

## With Petra

- Short, plain sentences: what you are doing, why, and what happens next.
  No jargon without a one-line explanation the first time it comes up in a
  conversation: branch, commit, push, pull request, merge, build, deploy,
  preview, production, rollback, test, lint, type check. Teach the vocabulary
  as it comes up; Patrik wants her to understand what he means and what Claude
  is doing.
- Before anything that changes what users see (a merge, a deploy), add an
  extra validation step with her: say what is about to change and what could go
  wrong, check that she understands, do it, then verify together on
  livhold.com.
- She can start developments and bug fixes with Claude. The same flow applies:
  a branch, a pull request, then a merge that someone accepts.

## With Patrik

- Advisor style: challenge the assumption first, tag confidence, no warm-up.
- He decides product questions. Record decisions in `docs/NOTES.md` and on the
  GitHub issue that holds the topic.

## Where the work stands (28 Sep)

- The Trip timeline (mock 15 §1, §4, §5, §6) is live: pull request #68 was
  merged with Petra on 23 Sep, then #71 and #72 with her findings from the
  phone. Every merge followed the validation step above and a guided test on
  livhold.com; findings are in `docs/NOTES.md`.
- The Money page (mock 16) is being built in two stages. Stage 1, the calmer
  page, went live with Petra on 23 Sep (#73); her round on the phone and the
  "Paid on" date for extras (one entry instead of two) followed in #74, and
  #75 lists each extra by name on the One-offs card. Stage 2, the quiet
  start, began with migration 41 (`profiles.track_spending`, the
  once-per-account answer), live on staging and production since 23 Sep:
  Petra applied it in the Supabase SQL editor, guided. Round 1 of the
  stage 2 app code, the question and the quiet page, went live with #79;
  #80 puts the Track spending switch right under the first card of both
  versions. Round 2, the cards that unlock as entries arrive, went live
  with #81 for journeys made after it (older ones keep every card). Round 3
  goes out in three pull requests. 3a went live with #88 on 24 Sep: the Subscriptions question
  on the entry form, and subscription charges that add themselves on their
  date, each announced until tapped ("Cancelled it?"). Patrik decided the
  latter on 24 Sep (#37); it was Petra's idea. 3b, the one-time offer for
  Subscriptions entries typed before 3a, went live with #91 on 24 Sep (Petra and
  Patrik answered it on Asia on 25 Sep): its charges start on the
  day of the answer, not back-filled (Patrik kept it, 26 Sep). 3c (#92, editing
  one-offs on Money) was closed unmerged on 26 Sep: see the next point. As
  built, every existing account is asked the tracking question once;
  Patrik can change that.
- Decided by Patrik on 26 Sep, in this order: (1) a per-entry "Counts in
  the daily average" switch (#36, reversing its 19 Sep "not building
  this"): the category decides by default, and every expense typed by
  hand has the switch ("Exclude from the daily average", or "Include…"
  for gear, insurance & visas and fees; never stays, transport or
  subscriptions, which the projection adds on its own). Live with #96;
  shown on every expense since #97 (first only above 3× the daily
  pace). (2) Then One-offs and planned
  one-offs (`state.extras`) went (#39), live with #100 on 26 Sep and
  tested by Patrik: paid ones became plain entries, out of the daily
  average; the list, unpaid ones included (Asia had none), is deleted
  from a journey the first time an editor opens Home, Money or All
  entries.
- Patrik fixed the Money reload loop of 25 Sep in another session
  (#93–#95, 26 Sep): the plan sync skips writes already queued, and a
  refetch no longer lands over writes still queued.
- Money is getting shorter (Petra, 23 Sep: about seven phone screens, the
  ledger alone over a third of it). Step 1 went live with #82, approved by
  Patrik: the ledger has its own screen, named All entries (Petra's pick;
  Patrik wanted a plainer word than ledger), at `/money/entries`. Scheduled
  payments fold into one line there, and month totals count only what is
  spent. It closed #38. Step 2 went live with #85 (Petra, 24 Sep):
  Bookings and Subscriptions (and One-offs & extras, until #100) fold to one line each, with
  a summary that carries anything needing attention. Plan and the cards
  above it stay open. The rows sit below Plan, followed by All entries and,
  last, Budget cap with a grey "Settings ›" (#86, Petra's choice over a
  colour of its own). Money is about 3 phone screens now.
- Money's forms (entry, subscription, category list) lost their ✕ with
  #89 on 24 Sep, like the Trip sheets on 23 Sep: the handle, the scrim
  and Escape close them. Search on All entries, by name or category,
  with what the matches cost, went live with #90 (Petra's idea, 24 Sep).
- Home's money card follows Money's projection rule, live with #83 on
  24 Sep (Petra's decision of 23 Sep). A new journey shows only what is
  spent until the projection unlocks; older journeys keep what they show.
- Decided by Patrik on 23 Sep: the Plan card's per-night line is gone (#78),
  and the globe question (#63, the timeline as a sheet over the globe) is
  Petra's to decide.
- Merges happen together with whoever is here, the same way: say what
  changes and what could go wrong, get a "go", merge, watch the Vercel build,
  test on livhold.com, record.
- No hourly check-ins on pull requests unless someone asks for them.
- Since 27 Sep another agent builds the iOS app (`ios/`) on Patrik's machine:
  Trip now, Money next. Web bugs on Home and Trip go first, and every web
  change to behaviour gets an "iOS:" line in its `docs/NOTES.md` entry (the
  rule and its file), because that agent reads `main`, not this chat.
- Decided by Patrik on 27 Sep (#58, #60, #62, #65):
  - home moves to the person (`profiles.home_base`, migration 43, since #101 takes 42),
    live on staging and production since 27 Sep; the app code reads it first and falls
    back to the journey's home;
  - Home keeps a Reminders row when nothing is due;
  - the Subscriptions card gets no unlock rule;
  - next comes the #65 wording pass on Home only (#106, the check-in as a sheet, turned out
    done since 20 Sep), then vias on the globe, then #107 last. Trip was redone in the iOS
    app, and the web may take features back from it.
- Patrik, 28 Sep: the Home wording pass goes out in #118, measured per #65's rule 5. It
  carries a travel-day fix found while measuring: Home now gives the day you move to the
  stop you move to, as Trip does, where it used to show "No bed tonight" and skip the arrival
  day. It needs merging before 30 Sep, the Bangkok → Hanoi move. Localisation (#119) comes
  after this round; the iOS app already keeps English and Hungarian in a String Catalog.
- 1 Oct: the list form for journey.livhold.com (Patrik and Petra's brief, `docs/landing-form/`)
  is built and, since 2 Oct, live with Petra (#136): `/api/journey-signup` on livhold.com,
  migration 44 (`journey_signups`, insert-only for the public key, purged after 12 months),
  and the `/privacy` section that covers it. journey.livhold.com is a hosted page, not a repo: the form is pasted in after the
  merge, never before. Patrik decided the providers on 2 Oct (Resend, a hand-written email to
  arrange a call, Google Meet, no booking tool); the policy names them. Migration 44 is on
  staging and production since 2 Oct (Petra, guided in the chat). Next: Patrik pastes the form
  (`docs/landing-form/README.md`), then one real submission. The policy is English only until
  #119.
- 3 Oct: journey.livhold.com leaves ChatGPT's hosting (Cloudflare there blocked Petra on a
  Vietnam VPN). Petra's site is in `landing/` (its README), with the list form written in by
  `tools/landing-form.mjs`, so nothing is pasted by hand any more. Live since 3 Oct on the
  Vercel project `landing` (Root Directory `landing`), form first ("Start your journey"
  scrolls to it), the list for update emails (#165). When it sends people straight to the
  app: Patrik and Petra, the Sunday review of 25 Oct.
  Patrik decided the same day: the app moves to app.livhold.com and the landing page (blog
  later) takes livhold.com, one repository, a Vercel project per folder. Done from his
  machine, before any Android TWA work: `docs/APP-MOVE-BRIEF.md`.
- 2 Oct, with Petra on livhold.com/privacy: the spaces (#137), the wash pinned to the screen
  (#138) and Safari's missing space before a bold word (#139, `tabular-nums` on `body`) are
  live, and the wash holds still on the iPhone (#143). Patrik: fix the Safari one on every
  screen, issue #140, next after the form's paste. The round closed with `/privacy` checked
  claim by claim against the code: five statements the code does not keep were #151 (the
  wording), #152 (no export exists) and #150 (no switch for the reminder emails); #5 stays
  open for Article 27 alone. Patrik decided the same day: the policy states how Livhold will
  operate, and each promise gets an issue that lands before launch, never weeks of features.
  The wording went out as one pull request (sessions keep IP and user agent; reminders are
  part of the service, switchable in settings, which is #150, high priority; unsubscribe
  keeps a "do not email" note; a copy of your data comes by email to privacy@, by hand, so
  #152 is closed; invitations are not emailed, they are rows matched at sign-in). It is live
  since 2 Oct (#155, Patrik's "go"); the once-more pass before the public release is #156.
- Supabase jobs that need Patrik's machine (the CLI) wait in NOTES under
  "NEXT MACHINE SESSION": the subscription-alerts deploy check, the
  `stay-deadline-alerts` redeploy, and the JWT secret rotation.
- Since 2 Oct Petra collects what people say on Reddit about apps like Livhold (her weekly
  task; Patrik's ask; issue #135). It lives in `docs/research/` (the README holds the routine): one file
  per thread under `sources/`, the needs in `needs.md`, the apps in `competitors.md`, and
  what it means for Livhold in `takeaways.md`, where Patrik decides. Reddit is blocked from
  Claude's container; Petra pastes the text or a screenshot and Claude types it out.

## Running the checks

From `product/`: `npm ci`, then `npx tsc --noEmit`, `npx eslint src`,
`npm test`, `npx next build --webpack`. From the repository root, `node --test landing/redirects.test.mjs`
checks that every app route redirects from livhold.com to app.livhold.com. The dev server and the build accept
placeholder values for `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Dev-only preview routes render screens from
fixtures without a sign-in: `/dev/trip-preview`, `/dev/money-preview`,
`/dev/map-preview`. Playwright is installed at
`/opt/node22/lib/node_modules/playwright` for phone-width screenshots.

## Where memory lives

This file is the memory that survives sessions: it is in the repository and
loads at the start of every session that checks the repository out. It reaches
other sessions once it is on `main`. Anything kept only in a session's
container is lost when the container is reclaimed.
