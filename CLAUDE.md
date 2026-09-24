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

## Where the work stands (24 Sep)

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
  latter on 24 Sep (#37); it was Petra's idea. 3b, the one-time offer, and
  3c, editing one-off costs on Money, follow. As built, every existing account is asked the
  question once; Patrik can change that.
- Money is getting shorter (Petra, 23 Sep: about seven phone screens, the
  ledger alone over a third of it). Step 1 went live with #82, approved by
  Patrik: the ledger has its own screen, named All entries (Petra's pick;
  Patrik wanted a plainer word than ledger), at `/money/entries`. Scheduled
  payments fold into one line there, and month totals count only what is
  spent. It closed #38. Step 2 went live with #85 (Petra, 24 Sep):
  Bookings, Subscriptions and One-offs & extras fold to one line each, with
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

## Running the checks

From `product/`: `npm ci`, then `npx tsc --noEmit`, `npx eslint src`,
`npm test`, `npx next build --webpack`. The dev server and the build accept
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
