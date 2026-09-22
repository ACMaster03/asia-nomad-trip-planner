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

## Pull request #68, the Trip timeline build

- Not merged on 22 Sep, on Patrik's instruction. On 23 Sep, merge it together
  with Petra and guide her through testing it: explain merge → Vercel
  production build → livhold.com, watch the build finish, walk the Trip page
  with her on her iPhone 13 (the timeline, the stop editor, Add stay with the
  deadlines, transport on a leg), and record what she finds in
  `docs/NOTES.md`. Say before merging that Vercel's instant rollback restores
  the previous deployment if something is wrong.
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
