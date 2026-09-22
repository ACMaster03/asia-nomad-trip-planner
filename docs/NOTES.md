# Project notes — open items

Running log. Newest first. Add an entry when something is left half-done, or
when a decision needs to survive the conversation it was made in.

---

## 2026-09-22

### MOCKED — the two mocks the product review put first: Trip timeline + globe sheet (#58, #63) and Money's quiet start (#62, #59, with #60's stay form)

Round 1, on the shipped tokens, in `design/mocks/15-trip-timeline.html` and
`design/mocks/16-money-quiet.html`. The same pages are published for review on a phone:
Trip https://claude.ai/artifact/RWcAg4Rz3RY1EiKPB935fy · Money
https://claude.ai/artifact/R7N1CQkiJUXaRbRF3vLFCq. Sample data is the live-shaped fixture
viewed Mon 22 Sep, day 23, Bangkok night 22 (FIXTURES.md, "Mocks 15 and 16 canon").

**15 — Trip.** One timeline: a hollow home node, leg cards between the stops (transport lives
there; the via is a chip that appears for flights), stop cards with their stays nested and the
"no bed" gap as an amber row, insert-a-stop on the rail, the journey picker as the title.
Variant A: the globe as canvas, the timeline as a sheet at three heights (78 px / 60 % / 91 %);
the sheets on the page cycle on tap so the heights can be judged on a real phone. Variant B: two
pages with cross-links. Then the stop editor, Add stay with #60's deadline fields (explicit
"No free cancellation" / "Charged at check-in" chips, the reminder on by default and naming its
date), transport on a leg, and the four tab-bar states under "a tab exists when it has
something in it".

**16 — Money.** The once-per-account question as a sheet over the bookings; the quiet page for
No; the Asia journey replayed on day 1, 4 and 9 with the fixture ledger so every unlock has a
date; the unlock table with the thresholds #62 left to the mock; the inline Subscriptions
question on the entry sheet; the one-time offer for entries already in the category.

**Proposed in the mocks, decided nowhere yet — the things to say yes or no to:**

- The stop's budget tick moves off the card into the stop editor, as a switch.
- An empty leg card is tappable and opens the leg editor. A leg cannot be deleted, only
  emptied: two stops always have a leg between them.
- Projected total, Plan by stop and the cap row unlock after **7 days** of pace; per day and
  the daily chart stay at 3 (as shipped); Where it goes at 3 colour families; the chart's range
  switch at 14 days. A card never disappears again once it has appeared on a journey. The
  7 days: yes, Patrik, 22 Sep.
- A journey longer than a month shows Subscriptions as a one-line door from day 1, not an empty
  card.
- "Doesn't repeat" is the third answer to the inline question; a later charge with the same
  name is matched to the subscription with one tap instead of creating a second one.
- The second door for deadlines (#60): a Deadlines row in Trip settings listing every cancel-by
  and charge date, content or not.
- The one-time subscriptions offer shows only to whoever categorised the entries.

**Round 2 of mock 15 (2026-09-22, Petra's seventeen comments on the review page).**
Decided from them: the budget tick stays on the city card; two states everywhere, Idea and
Booked, a typed price on an Idea counts as the estimate (Shortlist is gone); the comfort level
leaves the card and sits in the editor behind an ⓘ; legs are pale-mauve strips, stops white
cards; an upcoming charge reads "card charged on 29 Sep" in amber; each deadline date has an
"or" and its explicit-no chip; the reminder switch appears only once a free-cancellation date is
filled in; the way home is a dashed "not planned yet" leg into the home node ("Home again ·
30 Apr"), no card names the last city as the last stop; the summary line is just the nights;
nothing about forwarding booking emails until the feature exists; the flight connection stays,
demoted to a small optional link. Version A and B carry labels and a side-by-side table now.
Petra's vote: version A, because People gets its own tab; the phone test still decides.

**Round 2 of mock 16 (2026-09-22, Petra's twenty-two comments on the review page).**
Decided from them: a "Latest" strip with the last three entries right under the overview and
a two-second confirmation toast on save, the full ledger staying last (#38); the budget line
says only "N % of budget" and what is left, the cap amount lives in the Budget cap row, which
shows from day one; One-offs in two labelled columns, Planned and Paid, both right-aligned;
the Plan card leads with the projected total, one short line per city, the maths behind a tap
on the row and transport/one-offs behind "How it adds up"; the chart's average number moves
into the card's title line (a tall bar hides the in-plot label in the app today, filed as #66);
"card charged on", "2 legs to book", "nothing paid yet" and "stay not booked" in amber;
"from home" dropped from the subscriptions line; the cadence chips gain "Other…" (every N
months); "suggested from the name" goes behind an ⓘ; the one-time offer and every
subscription are visible to both travellers on a shared journey, both get the reminder, and
whoever answers the offer first settles it, ownership mattering only for the next journey;
every early page ends with "More appears as you log: a chart after 3 days, a projection after a
week". Seven days for the projection: Petra agrees, Patrik confirmed on 22 Sep.

**Decided on a phone, not here:** sheet or two pages (#63). What to time is in mock 15 §8: a
cold open of Trip on mobile data, how warm the phone is after five minutes of editing with the
globe behind the sheet, and how often a drag meant for the list spins the globe. Patrik handed
the test to Petra (22 Sep). Until the sheet exists it runs on the shipped Map page at
livhold.com, whose globe.gl globe is the one the sheet would sit on: the cold open and the
warmth can be measured there, the drag question cannot. The Vercel preview of this branch is
the same app behind a Vercel login (Vercel Authentication is on for every URL but the custom
domains), so it adds nothing to the test. Petra's steps are on the summary page,
https://claude.ai/artifact/U3adVKLbKRp7Dxr9UTDUYe.

**Measured (Petra, 22 Sep, an iPhone 13, mobile data, private tab, the shipped Map page):** cold
open to the route drawn, 2 s; Home after Map, 3 s (Home has no globe: that is the teardown plus
Home's own load); Map again from Home, 4 s, slower than the cold open because the globe is
rebuilt on every visit; five minutes with the globe alive, battery 83 % → 80 % and the phone
warm to slightly hot; an iPhone 13 is a strong phone, a mid-range Android does worse. Spin
was on (the shipped default; #63 turns it off), but the cost is the render loop itself: `Globe.tsx` never pauses drawing while the page is open. Read against §8's
three: the cold open passes, the heat and the battery do not for a screen opened many times a
day, the drag question is untested. Patrik's call. What the numbers argue for: build the
timeline as its own page first (§8's fallback), keep the globe on Map, and make "the globe
sleeps behind the sheet" (`pauseAnimation()` at full sheet height or after a few idle seconds,
spin off by default) a precondition before version A is tried on a phone again. People's tab
waits on that.

---
## 2026-09-20

### BUILT — Money v2: issues #35, #37, #38 and #39, off mock 14

Branch `claude/subscription-category-visibility-qur53t`. The mock's four commits
are the design record; this is the build. Nothing is deployed.

**The through-line: the page now speaks ONE number.** The overview, the Plan
card and the monthly card all quote `projection.projected`, and
`spending.test.ts` holds the invariant that keeps them there — the monthly bars
are the projection's own terms bucketed by month, so their total *is* the
projection, to the forint. Everything below follows from that.

- **#38 (ledger last).** `LedgerList` moved under the monthly card and starts at
  twenty rows, paging backwards. That saves render cost and scroll length, **not
  bandwidth**: the ledger is a jsonb column selected whole with the state, and
  the chart, donut, burn rate and projection all need the full array. Every
  total is still computed over every row. Tapping a bar in the chart pages the
  ledger down far enough to reach that day before scrolling to it.
- **#35 (the silent exclusion).** A "+ X beyond the everyday" strip on the
  overview, measured as `spent − everyday spent` so it ties to the per-day
  rate's own basis by construction. The old `PlanCard` line that named "Gear,
  e-SIM, insurance" is `projection.residual`, a subtraction, not a category
  sum — it is now labelled as the remainder it is.
- **#39 (one-offs).** A card reading `state.extras`, **planned and paid in two
  columns that are never summed**: the same visa fee lives in both, and adding
  them counts it twice. `ONE_OFF_CATEGORIES` is derived from
  `NON_DAILY_CATEGORIES` rather than re-listed, so a seventh non-daily category
  gets a home automatically instead of being lost the way `fees` was.
- **#37 (subscriptions).** `state.subscriptions` — declared anchor + cadence,
  never inferred from ledger history. Next charge, monthly run-rate and the
  charges-ahead total are all derived (`lib/trips/subscriptions.ts`), cancelled
  is a state rather than a delete, and reminders reuse the stay-deadline pipe.

**Two owner decisions, both taken during the build.**

1. **"To cover the plan" was rebuilt on the live projection**, not relabelled.
   It was the last place a pre-trip number survived after the overview lost the
   estimate, and it disagreed with everything above it by the amount Bangkok is
   under its estimate. `monthlyOutflow()` replaces `monthlyBuckets()` for this
   card. Planned one-offs are deliberately absent from the bars: `state.extras`
   carry no date, and they were never inside `projection.projected` either. The
   card footnotes them and points at the One-offs card.
2. **The alert pipeline ships with the branch** (migration 40 + TESTPLAN,
   `supabase/functions/subscription-alerts/`). Code only — see the deploy note.

**A correction to canon, found by building it.** The mock totalled the
subscriptions ahead by amortising the run-rate over the days left (≈84 000).
Counting the charges on their real dates gives **100 620** — the difference is
the yearly domain renewal, a twelfth of which was being billed per month when
the whole 18 000 lands on 12 Nov. Amortising understates the cash *and* cannot
place a charge in a month, which the monthly bars have to do. FIXTURES and mock
14 are updated; the projection is 4 132 420 and subscriptions move it
**90% → 92%** of cap, not 90% → 91%.

### TO DEPLOY — subscription alerts (nothing is live yet)

Order matters: the function first, the cron job second. A job pointing at a
function that does not exist 404s once a day in silence.

    supabase functions deploy subscription-alerts --project-ref <ref>
    tools/db.sh sql supabase/migrations/40-subscription-alerts.sql
    tools/db.sh sql supabase/migrations/40-TESTPLAN.sql   # staging first

Docker must be running for the deploy (see the digest note, 2026-08-28). The
function needs no new secrets — it reuses `CRON_SECRET`, `RESEND_API_KEY` and
`ALERTS_FROM`.

**Hit on the first staging deploy, 2026-09-20 — a new function defaults to
`verify_jwt = true`.** The cron jobs send the signed `x-cron-ts` / `x-cron-sig`
pair and NO `Authorization` header, so the platform answers
`401 UNAUTHORIZED_NO_AUTH_HEADER` before `hasCronSecret` runs. Daily, silent,
and indistinguishable from "nothing was due" — the same shape as the outage 38
was written to clean up. Probing staging made it obvious:

    stay-deadline-alerts   403 forbidden            ← its own gate, correct
    fx-refresh             403 {"error":"forbidden"}
    digest-send            403 forbidden
    subscription-alerts    401 UNAUTHORIZED_NO_AUTH_HEADER   ← platform gate

So **after every deploy of a cron-invoked function, curl it unsigned and expect
403**. One line, and it catches the whole class:

    curl -s -o /dev/null -w '%{http_code}\n' -X POST \
      https://<ref>.supabase.co/functions/v1/subscription-alerts

The fix is `--no-verify-jwt` on the deploy, and
`[functions.subscription-alerts] verify_jwt = false` now lives in
`supabase/config.toml` so a later redeploy cannot quietly turn it back on. The
other three functions are left alone there: their dashboard setting is already
right, and configuring them from assumption could break a working one.

**The one thing worth knowing** if this ever misfires: `alert_log` is unique on
(trip, item, kind, recipient) **forever**, which is right for a one-off stay
deadline and wrong for anything recurring. The function puts the charge date in
`kind` (`sub:2026-09-23`), so each occurrence is its own alert and October's
reminder is not swallowed as a duplicate of September's. 40-TESTPLAN proves both
halves. The trigger is also a window (fires at `leadDays` away *or nearer*)
rather than an exact day, so a Resend hiccup on the day retries tomorrow instead
of losing the single ping for that charge.
---
## 2026-09-19

### DONE — the phone review's findings, minus Money, plus two bugs from the road

A screen-by-screen review came back with six findings. Money's is deliberately
untouched: the Money v2 mock on `claude/subscription-category-visibility-qur53t`
plus issues #35 / #37 / #38 / #39 are that same finding already being redesigned,
and relabelling the live page now would pre-empt it.

**Add entry (the sheet, not the page).** The currency started on the last one
typed, which is right until you cross a border: a Bangkok stop kept offering the
currency of the flight that got you there. It now opens on the currency of the
country containing today's date, falls back to the last used before departure
and between stops, and never offers a code the trip does not watch, because an
unwatched code has no rate and would total as zero. `lib/trips/entryCurrency.ts`
is pure and tested; the caller does the catalogue lookup, since the alias does
not resolve under the node test runner. The date was a grey "Today - change"
link and is a labelled field now.

**Tap safety.** "Add stay" and "Delete" sat 16px apart in the same colour inside
every stop card. Delete moved into the stop editor, below a rule, in the warning
colour. The editor had no delete at all before this, although the page copy has
promised one since it was written. The raised centre tab shows the words
"Check in" like its four siblings.

**Explanations where the choice is made.** Comfort tier says it picks one of the
city's three nightly price bands and moves nothing you entered yourself.
Unticking a stop no longer claims to remove it from the budget full stop (see
the open bug below). The Hazards count chip opens a panel naming its two
unrelated sources, the real age of the USGS fetch, and the fact that neither
source is an advisory or a forecast.

**Home.** The trip position was stated three times: header subtitle, stay card,
and a second progress bar captioned identically to the header. The second bar is
gone and its unique facts (percentage, date home) joined the "Day N of M" line.
Activity opens at five rows instead of thirty, expanding in place.

**Explore.** The city detail was every catalogue field in DB order as a
two-column list, landmarks worst of all at six labelled values per line. It now
leads with the four things that actually decide a city (day cost, whether you can
work, this month's weather, what to watch for), gives each landmark a card, and
puts the rest behind native `<details>`. The summary reads the same keys
migration 03 seeds, and `PROMOTED` in `CityCard.tsx` keeps them from appearing
twice; if a key is ever renamed the cost is a repeat, never a blank screen.

### RETIRED — Plan vs actual, after two rounds of testing

Gone, at the owners' decision (2026-09-20). Worth writing down because it is the
one thing rescued from /live that did not survive, so /live now leaves nothing
behind at all.

It moved twice before it went. Onto Home when /live was retired, because the
instruction was that nothing be dropped in the merge. Then to Trip > Stops when
the first tester reported it cramped on a nine-stop route: proportional widths
made a three-night stop a sliver with an unreadable label, and the caption was
four rules and a maths symbol on one line. Both were fixed (minimum widths, a
plain-English caption, and an "off plan" pill that stopped wrapping the
heading). She still did not want it, and on reflection neither did Patrik: it
answered a question neither of them was actually asking day to day.

If it comes back, it is whole in the history: `components/trips/PlanVsActual.tsx`
as of f7d0d7f, rendered from StopsTab. What it did that nothing else does is put
the planned route and the recorded arrivals side by side; the drift banner on
Home is a different and narrower test (latest CHECK-IN place name, within 48
hours), not a replacement.

### DONE — /live is retired; everything it had that Home lacked moved to Home

The duplication behind the "check in does nothing" report is gone. /live was
Home a second time and is now a redirect to /dashboard. A redirect, not a
deletion: installed apps hold their last URL, the worker caches documents by
path, and phones carry bookmarks.

Where each piece went, so nothing was dropped:

| /live had | now |
|---|---|
| check-in sheet | `components/checkin/CheckInProvider`, mounted above every screen |
| Note | a mode of that sheet, placeless on purpose |
| Arrived | Home, arrival day only, gone once recorded |
| Plan vs actual | retired; see the entry below |
| edit / delete / queued | Home's feed rows via `SocialRow` |
| pre / post phase screens | Home already had its own, BeforeYouFly included |

Two bugs fell out of the merge rather than being looked for. Home's "Arrived"
was a LINK to /live, so it recorded nothing and moved you to a screen with
another Arrived button on it. /live's was a real button shown every day of the
trip with no already-recorded check, so it wrote duplicate events while its
toast claimed "the button is done for this stop".

`app/(app)/live/` keeps its name because CheckInModal, EditEventModal,
FollowerNudge and Sheet still live there and are imported from elsewhere. Worth
moving under `components/` one day; not worth the import churn in the same
change that deletes the screen.

### NOTE FOR ANYONE VERIFYING UI HERE — the dev server cannot be driven

Its HMR websocket never connects in the Claude Code sandbox, so React never
hydrates: `next dev` serves correct HTML in which every control is inert. That
is why the /dev/*-preview routes looked like they were stuck waiting on
Supabase earlier in this branch. They were not.

`next build && next start` hydrates fine and can be driven with Playwright. A
throwaway probe page under `app/dev/` that renders the component with the real
provider stack, and NO `NODE_ENV` guard so it survives a production build, is
the way to actually look at a change before shipping it. Everything in this
round was checked that way.

### FIXED (symptom) / OPEN (cause) — Check in went to a page, not to a check-in

Reported 2026-09-19 as "the check in button doesn't work, it loads a page that
shouldn't be there, with another look". Screenshots of both screens settled it,
and the first guess below was wrong.

**What it is.** The raised tab linked to `/live`, and `/live` is Home again.
Side by side they carry the same title ("Bangkok, night 19"), the same stay
line, the same progress bar, the same "10 nights left", the same "Next: Hanoi ·
30 Sep", the same activity count, and the same full-width green "Check in -
where are you?" button. So pressing Check in produced a differently-arranged
copy of the screen you were on, with an identical Check in button sitting in it.
Read as "nothing happened", which is the correct reading.

**Fixed:** both entry points (the raised tab and Home's own button) now go to
`/live?checkin=1`, and LiveClient opens the check-in sheet on arrival, dropping
the parameter so a reload or a back does not reopen it. One press, one sheet.

**Still open:** `/live` and Home should not be two screens. What `/live`
genuinely adds over Home is Arrived, Note and PLAN VS ACTUAL; everything above
those is Home restated. The intended end state is already named in AppNav
("links to /live until Phase 7 replaces that screen with the check-in sheet"):
the sheet belongs in the layout, and what remains of /live belongs on Home or
behind Check-ins. That means lifting the check-in mutation, the photo upload
and the offline outbox out of an 800-line LiveClient, which is a deliberate
piece of work, not a fix to slip into a review pass. It also decides the
vocabulary question below, since the Check in / Arrived / Note / Activity split
is the same duplication seen from the wording side.

### CONFIRMED then FIXED — a navigation under an open sheet unpinned the tab bar

Reported minutes after #42 went live: on long screens (Explore, the ledger) the
bottom tab bar stopped being fixed and could be scrolled past, "finding its
place" again on scrolling back. Gone after #44. iOS only; a headless Chromium
probe rendering the real AppNav inside the real layout kept it pinned at every
scroll offset and found no transform, filter, contain or will-change anywhere in
its ancestor chain, so the markup was never the problem.

The path: `lockBodyScroll` holds a sheet open by setting
`document.body.style.position = 'fixed'` with `top: -scrollY`, which is the only
lock iOS respects. iOS is also non-compliant about `position: fixed` descendants
of a fixed body: they can stop resolving against the viewport and resolve
against the body box instead, which begins at `-scrollY` and runs the full
content height. A tab bar at `bottom: 0` of THAT box sits at the bottom of the
document. #42 fired `router.replace` while the sheet was open, i.e. a real
navigation under a locked body, and #44 removed it.

**The lock itself is unchanged and still sharp.** Nothing triggers it today,
because the trigger was removed rather than the fragility. Two things to fix
before the sheet moves anywhere:

- `if (depth++ === 0) savedY = window.scrollY` reads 0 when the body is ALREADY
  fixed from a leaked lock, so closing the sheet scrolls the reader to the top.
  Recover the offset from `body.style.top` when the body is already fixed.
- Nothing releases the lock if a sheet unmounts without its cleanup running.
  A release keyed to navigation, or an assertion on route change, would stop a
  leak becoming permanent.

This is a prerequisite for collapsing /live into Home, not a follow-up: that
work puts the check-in sheet in the layout, where it is mounted across far more
navigations than it is now.

### WRONG TURN, kept for the record — the offline page was not the cause

Before the screenshots arrived, "a page with another look" was read as
`public/offline.html`, on the grounds that it was the only page in the app not
on the LIVHOLD tokens. It was not what the traveller saw. The rewrite of that
page stands on its own merits (it was on the dead teal kit, and it asserted
"You're offline" when the same page also answers a navigation that merely ran
out of the worker's 25s budget), as does making the offline warm-up yield to a
real navigation. Neither was this bug.

### OPEN — an unticked stop still owes money for its bookings (Money, not fixed here)

`computeBudget` drops a stop with `include === false`: its nights, its estimate
and its daily living leave the forecast. `bookingsSummary` does not: it filters
stays by `stay.include` alone and never looks at the parent segment, so a booked
hotel for a dropped stop still counts in `paid` / `toPay`, and `importCosts`
has already written it into the ledger.

Both behaviours are defensible and the current pair is not. Removing the money
with the stop is the tidier model but deletes real committed spending from the
ledger, which is the worse failure. The likelier answer is to keep counting it
and mark the row as belonging to a stop no longer in the plan. Left for the
Money round rather than decided in passing; the Stops copy now states the actual
behaviour instead of the tidy one.

### OPEN — what Map is for (Patrik's call)

The review: "the globe, controls, legend, city card and Explore search compete
for attention; decide whether Map's main job is route overview or city
discovery, then make that action dominant." That is a decision, not a fix, so
only the Hazards half was built. Worth settling alongside issue #21, since
between-trips is exactly when Map stops being a route and becomes a browser.

### OPEN — one vocabulary for Check in, Arrived, Note, Activity, post

Five words for what a traveller does, from five rounds of building. "Check in"
is the action and a nav label; "Arrived" is a second action on the same screen;
"Note" is a field inside a check-in; "Activity" is the feed; "post" is what a
follower sees and what `/post/[id]` is called. Nothing is wrong on its own and
the set does not add up.

A shape that would: **check in** stays the only verb; what it produces is a
**post** everywhere, for traveller and follower alike; **Arrived** becomes a
kind of check-in rather than a sibling action; the feed is **Posts**, not
Activity; and the free-text field is what it says on the ledger sheet, a
**note**, lower case, never a section heading. Renaming touches copy, two nav
labels, a route name and the follower projection, so it wants doing once,
deliberately, not on the way past.

---

## 2026-09-18 (evening)

### IN REVIEW — the planner globe: #32 MERGED (PR #33), #9 open as PR #34

PR #33 (`fix/globe-eight`, issue #32) merged to main 2026-09-18. PR #34
(`feat/routes-touch`, issue #9) now targets main directly and is clean;
the review page's three questions are all answered and built (mark glyphs,
sheet per trip, Home showing only today's meet-ups as a dismissible queue).

**#32, the eight fixes**, all in `components/Globe.tsx` and `app/(app)/map`:
one globe.gl instance for the life of the screen, patched in place (the
camera no longer resets on a trip edit); `?city=<id>` carries a tapped pin
to Explore; a tap swaps the bottom card to that city (touch has no hover);
hazards demoted to amber, half-size, translucent, rings only for M5.5+ and
400mm+; Borders toggles the polygons themselves; 130/480 zoom clamps; spin
pauses on touch and resumes after 10 s; the USGS feed goes through React
Query (15 min stale, 8 s timeout). One extra thing found on the way:
globe.gl resolves a click through the object hovered on the last frame and
re-raycasts at most every 50 ms, so a quick tap could land on nothing —
there is now a fallback hit-test that picks the nearest pin under the finger.

**#9, where our routes touch**: `lib/map/people.ts` (pure, tested) groups
the people you follow by the city they are in and computes overlaps between
your segments and their `followed_trip_summary` routes. Sky-blue HTML marks
on the globe (the one hue outside mauve/hunter/amber), thicker per head
count, names only in the sheet; "Show route" draws one person's itinerary
beside yours; the same overlap line sits under Home's people strip. No
migration and no new RPC. Verified on staging with a rolled-back run
(scratch SQL, seeded follow graph, both RPCs asserted; nothing persisted).

**Dev-only preview, no sign-in:** `/dev/map-preview` (`?screen=knowledge&city=4`,
`?screen=home`). Fixtures in `app/dev/map-preview/fixture.ts`.

**Open, for Patrik's review:** the review page (artifact) has one question
per screen — mark sizing bands, the sheet's copy, whether Home shows more
than three meet-ups. Nothing is blocked on the answers.

---

## 2026-09-18 (later)

### DONE — the auth config lives in the repo, and both projects run it

`supabase/config.toml` + `tools/auth-config.sh`. The dashboard is no longer the
source of truth for auth: change the file, push, review the diff the wrapper
prints. A second push to either project reports every service `up_to_date` and
changes nothing, which is the only real proof the file matches what runs.

    tools/auth-config.sh --staging push     # snapshot → push → diff what moved
    tools/auth-config.sh --prod    push
    tools/auth-config.sh --prod    show     # live config, secrets redacted

Needs two gitignored files: `supabase/.mgmt-token` (a Supabase PAT, for READING
the live config) and `supabase/.smtp-pass` (the Resend key, for either push).

**Four things that only came out by doing it:**

- **A push sends the whole config, and it reaches storage as well as auth.** A
  key missing from the file is sent as the CLI's DEFAULT. With no `[storage]`
  block the CLI offered prod `vector.enabled = true`, which answered 402 and
  aborted the push *after* auth had been written. Never delete a key here to
  "reset" it.
- **`config push` does not prompt.** It prints a diff and applies. It also
  ignores `--workdir` (reads `supabase/config.toml` from the shell's cwd), and
  `content_path` resolves from that same cwd, hence `./supabase/email-templates/…`.
- **A wrong `env()` value fails like a missing one, only later.** The wrapper
  used to export a placeholder credential for staging; when staging gained SMTP
  that placeholder became its mail credential, and every sign-in answered 500.
  The reason was visible only in the project's auth logs:
  `535 "Authentication credentials invalid"`. Read them with
  `GET /v1/projects/<ref>/analytics/endpoints/logs.all?sql=select timestamp,
  event_message from auth_logs order by timestamp desc limit 15`.
- **A free tier project on Supabase's default sender cannot change email
  templates at all** (HTTP 400, "please upgrade your plan or configure a custom
  SMTP provider"), and because the auth update is atomic the whole push fails.
  Staging therefore sends through Resend too now, as "Livhold (staging)".

**What prod changed:** the signup subject had a typo since it was written
("Start you journey with Livhold!"), both template bodies, and `smtp_pass` —
prod's stored hash differed, so prod now sends on the key in
`supabase/.smtp-pass`. **Keep that key alive in Resend; sign-in depends on it.**
Verified with a real `/otp` call to prod: 200, no error in the auth logs.

Also corrected while reading the live config: both templates promised "expires
in 15 minutes" while prod's `mailer_otp_exp` is 3600. The copy says an hour now.

### OPEN — rotate the project JWT secret (Patrik), deferred 2026-09-18

Both projects' `jwt_secret` was printed into a Claude session transcript on
2026-09-18 (an unfiltered dump of `GET /v1/projects/<ref>/postgrest`). It never
left the machine or that session, so this is deferred rather than urgent —
Patrik's call, not to be done during departure season. What it costs when you
do it:

1. Dashboard → Project Settings → API → rotate the JWT secret.
2. Paste the new anon key into Vercel as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Production **and** Preview), then redeploy. That is the only place the app
   holds it: `product/src` reads `NEXT_PUBLIC_SUPABASE_URL` and the anon key,
   and no service-role key at all.
3. Edge Functions need nothing: `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL`
   are injected by the platform.
4. Everyone signed in is signed out once and needs a fresh magic link.
   Followers on share links are unaffected — those are share tokens, not auth.


### CLOSED — the three deploy TODOs below were already done; and what was never committed

Two separate things, both the same shape: work that happened but left no trace
where the next person looks.

**The deploy TODOs were stale.** Checked against the live projects rather than
the file, with `supabase functions list --project-ref <ref>`:

| Function | staging | prod | code last changed | verdict |
|---|---|---|---|---|
| `push-fanout` | v9 @ 10:14 | v9 @ 10:18 | 10:04 (37 rewrite) | 37-aware build live |
| `fx-refresh` | v3 @ 12:47 | v5 @ 12:48 | 08-08 (signed auth) | signed build live |
| `stay-deadline-alerts` | v10 @ 12:58 | v11 @ 12:58 | 12:53 (mute fix) | mute fix live |

A version bump only proves *something* was deployed, so the two that mattered
were read back: prod `stay-deadline-alerts` contains the `trip_notify` /
`muted` filter, and prod `fx-refresh` ships a `_shared/cronAuth.ts` identical to
this repo's. **Nothing is waiting on a function deploy.** Downloading a
deployed function is the check to reach for — see the fx-refresh paragraph
below for the one trap in it.

**Three pieces of finished work existed only on the Mac**, untracked or
unstaged, and would have died with the laptop:

- the `tools/db.sh` relative-path fix and its entry here (2026-09-16),
- `supabase/checks/stay-status-scan.sql` — the file that entry points at,
- `supabase/email-templates/` — README and both HTML templates, written
  2026-08-21 and never added.

All three are committed now. The last one is half of the "WORTH DOING" entry at
the bottom of this file: the templates are under version control from today,
though still pasted into the dashboard by hand.

### FIXED — the audit's other holes (PR after the cron one)

- **Deadline pushes ignored the per-trip mute.** `stay-deadline-alerts` read
  only `profiles.notify_deadline_push`; a trip muted under Account → Alerts
  still buzzed for cancel-by dates while the screen promised silence. It now
  drops users with a `trip_notify.muted` row for that trip (email unchanged).
  Deployed on both projects at 12:58 the same day (staging v10, prod v11).
- **The Alerts screen could overwrite real settings.** The save is a whole-row
  upsert built from the fetched row, and a failed fetch fell back to the
  defaults with the switches still live. Switches (and the per-trip ones, on
  Account and in the journey sheet) are locked until the fetch succeeded.
- **Migration 39:** `rotate_share_link()` refuses an expired link (36 refused
  revoked only); the UI marks expired links and hides Rotate.
- Follower Home no longer reads a failed `my_following` as "you follow nobody";
  it shows a retry row instead. `?auto=` on the follow page only accepts UUIDs.
  The last locale-less `toLocaleDateString()` (ActiveTripCard) is pinned to
  en-GB like the others. Alerts intro copy no longer claims an email fallback
  for everything.

**Checked in the Supabase dashboard, 2026-09-18 (Patrik):** Auth → URL
Configuration now carries `https://livhold.com/auth/callback**` and the www
twin, so `?next=` survives on both hosts. Why the wildcards, for next time: a
redirect is accepted on the Site URL host regardless of path, but on the other
host (apex vs www) only an allowlist match counts, and an exact
`/auth/callback` entry does not match `/auth/callback?next=…`. Supabase then
silently sends the person to the Site URL — signed in, no follow.


### FIXED — every scheduled function call on prod had been refused for weeks

The post-shipping audit checked whether 37's signed push fan-out actually
reached prod, and found something older: all three `cron.job` rows on BOTH
projects still sent the pre-30 raw `x-cron-secret` header, and prod's
functions held a `CRON_SECRET` whose digest did not match
`app_config.cron_secret`. Every call from the database — fx-refresh at
02:00, stay-deadline-alerts at 07:00, digest-send at 13:00, and the new
push fan-out — came back 403. Migration 30's cron block never landed
anywhere; `tools/db.sh` keeps no applied ledger, so "in the repo" was read as
"live".

Done today: migration 38 (30's cron block alone, defensive, `extensions.hmac`)
applied on staging and prod; `tools/rotate-cron-secret.sh` set one fresh
secret on both sides of both projects, digests only on screen; the probe
`supabase/checks/cron-kick.sql` (push-fanout, nil event id, no side effects)
answers 200 on staging and prod. Read-only probes for next time live in
`supabase/checks/`: `cron-jobs.sql`, `cron-secret-digest.sql`,
`push-fanout-health.sql`.

**Do not re-apply 30**: its `notify_push_fanout` body would overwrite 37's.

**Done the same afternoon:** `fx-refresh` redeployed on both projects (staging
v3, prod v5, 12:47/12:48) — it had sat on a pre-30 build and rejected the signed
form. Verified after the fact, not assumed: the deployed bundle's
`_shared/cronAuth.ts` is byte-identical to the repo's signed-HMAC version on
both projects. `supabase functions download <slug> --project-ref <ref> --workdir
<a scratch dir>` is the way to check — it writes into
`<workdir>/supabase/functions/<slug>`, so never run it in the repo root or it
overwrites the source. The 02:00 run is the first real proof in the logs; the
first check-in on prod should produce a 200 row in `push-fanout-health.sql`
with a `links`/`accounts` summary.

Note for `tools/db.sh` in API mode: only the LAST statement's rows are
printed. A two-query check file silently loses its first table — write one
statement (union) or two files.


## 2026-09-16

### DONE — scanned prod for stays with no `status` (the risk in ed0a471)

Gating stay money on `status` (`commitment.ts`) fixed ticked drafts being
billed as owed, but it flipped the failure mode: a stay that is genuinely
booked and carries no `status` now reads as a draft and stops counting. Every
code path sets one, so this was a "probably fine" shipped to testers.

Scanned it instead of assuming: `supabase/checks/stay-status-scan.sql`.

**Zero flagged rows.** All 16 stays in prod carry a valid status — 15 `chosen`
(14 ticked), 1 `shortlist` (ticked). No null, empty or unrecognised values.
The predicate was validated against a fixture first (case-insensitivity,
whitespace, missing key, missing `include`), because staging has no stays and
an empty result there proves nothing.

**One thing left to eyeball, not a code issue.** The ticked `shortlist` stay is
excluded from committed money by design. That is right only if it is really
unpaid — if the tester booked it and left the status alone, Money now
UNDER-reports, the mirror of the bug this fixed. Worth one look at that stay.

### FIXED — `tools/db.sh sql <file>` with a relative path

The API path runs the CLI with `--workdir "$LINKDIR"`, so a relative `-f` was
resolved against `supabase/.links/<target>/` and failed with a `NotFound`
pointing at a directory you would never think to look in. Broken for every
relative path since CLI mode landed; the built-in checks never hit it because
they are passed as `"$CHECKS/…"`. `run()` now absolutises before dispatching.

## 2026-09-14

### OPEN — turn password sign-in on in the Supabase dashboard (Patrik)

**The code is merged and does nothing until this is done.** Password sign-in is
on the login screen and in Account → Password, but the Supabase project still
has the password grant disabled, so every attempt answers
`Invalid login credentials` no matter what anyone types.

1. **Authentication → Providers → Email → enable password.**
2. **Leave "Allow new users to sign up" ON.** ⚠ An earlier version of this
   entry said to switch it off, on the premise that the app has no sign-up.
   That premise is wrong: public sign-up is deliberate and is the main way
   people start a journey (Patrik, 2026-09-18). A magic link to a working
   address is the check that the address is real. Turning it off would close
   the front door. Enabling the password grant does not require it, and the
   Play review account is created by hand either way.
3. **Create the review account by hand** (Authentication → Users → Add user,
   with a password), then give Play Console that address and password under
   **App access**.

**Why it exists at all.** Google Play requires sign-in details that are
"reusable, valid regardless of user location", and says explicitly that an app
gated behind *one-time passwords* must provide credentials that bypass them — a
magic link is a one-time password, so the old configuration could not be
reviewed. The second reason is ours rather than Google's: a password has no
email round trip, so it cannot be lost to a slow mail server or handed to the
wrong browser, which is the failure `lib/supabase/otp.ts` exists to document.

**No email-template change is needed.** The reset link points at
`/auth/callback?next=/account`, which reads `?next=` and handles both shapes —
the default `/auth/v1/verify?…&redirect_to=` template *and* a repointed
`/auth/confirm` one. `recovery` was already in `OTP_TYPES` in
`app/auth/confirm/route.ts`. This deliberately avoids the
`{{ .Type }}` trap in `docs/AUTH-EMAIL-TEMPLATE.md` that cost two test rounds.

**What is NOT verified.** This session's container has no egress to
`*.supabase.co` (403 from the egress proxy), so a real sign-in was never
exercised — only the UI, and the no-connection error branch. **The first
password set and the first password sign-in are their own test**, along with
one reset link opened from a phone's mail app, which is the journey that broke
before.

### OPEN — establish whether Article 27 applies at all (Patrik) — the premise below was wrong

**The earlier version of this entry said "KeepYourHabits Ltd is London-based
with no EEA establishment". Company records contradict both halves**, so the
conclusion that followed from it — that a representative must be engaged — is
not safe to act on until someone qualified confirms it. The field stays unset
meanwhile, because "unresolved" is the honest state just as "unmet" was.

Three independent documents, all in Drive under `MSI PC leftover`:

| Source | What it says |
|---|---|
| Certificate of Incorporation, company 17055436 (25 Feb 2026) | Sole director and PSC Patrik Tamás Grohmann — **"Country/State Usually Resident: HUNGARY"**, Hungarian nationality |
| `Clarification_ Relationship with UK.pdf`, signed as sole director, 28 Feb 2026 | "all management and operational activities are carried out remotely from **Hungary, where I reside**… no employees, physical premises, or customers located in the UK… managed from Hungary" |
| `Hoxton Mix Certification.pdf` | 66 Paul Street is a **virtual office** subscription — "This does not imply physical occupation of the premises." |

So the UK presence is a mailbox, and the company is run from Budapest.

**Why that may remove the obligation rather than shrink it.** Article 27 binds
controllers caught by Article 3(2) — those with *no* establishment in the Union.
Establishment under the GDPR turns on the effective and real exercise of
activity through stable arrangements, not on where a company is incorporated.
A company whose only director manages it from Budapest has a serious argument
that it *is* established in the Union, in which case Article 3(1) applies and
Article 27 never engages.

**"The representative is me" is the one answer that does not work.** The role
exists to give EEA data subjects and supervisory authorities a contact separate
from the controller; a controller does not represent itself. The live question
is not who to appoint — it is whether anything needs appointing.

**Two consequences if the Hungary reading is right**, and both reach further
than one field:

- The policy currently reasons throughout from "UK controller → UK GDPR → ICO".
  An establishment in Hungary would put the Hungarian NAIH in the picture, quite
  possibly alongside the ICO rather than instead of it, since the company is also
  UK-incorporated.
- It is *cheaper* than the alternative — no £300–800/year representative — which
  is exactly why it deserves a qualified opinion rather than a hopeful reading by
  the people who benefit from it.

Worth an hour of somebody qualified, with those three documents in front of them.
Still not urgent enough to block the Play submission.

If it turns out a representative *is* needed, commercial providers do this for
roughly £300–800/year.

**ICO: settled, and separate from this.** The data protection fee is paid for
this year (owner, 2026-09-15), so the company is on the ICO register. Two things
follow, neither of which the payment itself covers:

- It **renews annually**, and lapsing is an enforcement matter in its own right.
  It is also exactly the sort of thing that lapses while somebody is on the road
  and not reading post. Put the renewal in a calendar rather than trusting the
  reminder email to reach you.
- The register entry is public and carries the **registered address** — one of
  the fields still unset in `entity.ts`. Take it from there rather than from
  memory: it is the address the regulator already holds, and the privacy policy
  should not disagree with the regulator.

Paying the ICO fee is *not* the Article 27 item above. One is a UK registration;
the other is an EEA representative. Neither substitutes for the other.

### MOSTLY DONE — the company facts on the legal pages (one left)

`/privacy`, `/terms` and `/delete-account` are built and linked from the sign-in
screen. Five of the six facts are now set; an unfilled value still renders as an
orange `[… — not set yet]` marker rather than printing the token, so an
unfinished page cannot be mistaken for a finished one.

All of them live in **`product/src/lib/legal/entity.ts`** — one file, one edit:

| Field | State |
|---|---|
| `entity` | ✅ `KeepYourHabits Ltd` |
| `jurisdiction` | ✅ `England & Wales` — London-based, confirmed with the owner |
| `address` | ✅ `66 Paul Street, London, England, EC2A 4NA` — read off the Companies House register for company **17055436**, not recalled |
| `contactEmail` | ✅ `privacy@keepyourhabits.com` — **see the caveat below** |
| `dataRegion` | ✅ `Ireland` — prod `Nomad_Trip_Planner` runs in `eu-west-1` |
| `euRepresentative` | ❌ still unset — see the Article 27 entry above |

`/terms` and `/delete-account` now carry **no** markers at all. `/privacy` has
exactly one left, at the Article 27 line.

**`privacy@keepyourhabits.com` has to actually exist and be read.** Nothing in
the code can check that, and this is the one of the five that fails silently: a
policy naming a dead address is worse than one naming none, because Play treats
it as a working contact route and a GDPR request landing there starts a
one-month clock whether or not anyone is looking. Confirm the mailbox or the
forwarding rule before submission.

**`dataRegion` was checked, not recalled** — `supabase projects list` reports
`eu-west-1` for the prod project, which is AWS Ireland. This had a knock-on
effect worth knowing about: Vercel already serves from Dublin, so the transfers
section's "providers in Ireland and *X*" would have rendered as "Ireland and
Ireland". It now names one country. If the Supabase project is ever moved to
another region, that sentence has to go back to naming two.

**The UK Ltd changed the policy, not just a field.** The rights section named
"the GDPR" generically, which is wrong for a UK controller: it now names the UK
GDPR and the Data Protection Act 2018, points UK complaints at the ICO and EEA
complaints at the reader's own authority, and adds a data-transfer section
resting on the UK↔EEA adequacy decisions in both directions.

**Where these came from.** An earlier session could not reach
keepyourhabits.com (egress proxy) and left the values unset rather than guess
them. They were filled in on 2026-09-16 from the Companies House public register
and from the Supabase project itself — both authoritative sources rather than
the landing page, which is why they are safe to disagree with if that page says
something else. If the landing page's policy names a *different* entity, that is
a discrepancy to resolve, not a value to copy.

**Not reviewed by a lawyer.** The liability and governing-law clauses in
`/terms` are the ordinary shape of such a clause, written to be read rather than
litigated. Worth an hour of somebody qualified before this is a paid product; it
is defensible as-is for a free one.

### DONE — /delete-account, which Play requires and nobody had noticed

Play's User Data policy wants account deletion available **two** ways: in the app
*and* at a public web URL that works with no sign-in and no install. The in-app
half has existed since migration 26; the URL half did not exist at all, and it is
a required field on the Data safety form.

`/delete-account` is deliberately **not a button**. An unauthenticated endpoint
that erases an account on request is an account takeover with extra steps —
`delete_my_account` keeps no tombstone and has no undo. Play asks that a *request*
be possible without signing in, not that the deletion itself be unauthenticated.
So the page routes: the real button stays behind the session, and an
identity-checked email route covers anyone locked out.

### REFERENCE — docs/PLAY-DATA-SAFETY.md

The Data safety form is a second declaration of the same facts as `/privacy`, and
Google compares them. Every answer is worked out there with its evidence in the
code, so the two cannot drift. **Read the EXIF warning in it before anyone
touches `lib/trips/media.ts`** — the "we do not collect location" answer rests
entirely on that function's canvas re-encode, and an "upload original" feature
would silently turn the form into a false declaration.

---

## 2026-09-18

### DONE — deploy push-fanout after migrations 36/37 (both projects)

`37-notify-matrix.sql` moves push routing into the database (`push_audience_event`
/ `_comment` / `_reaction`, service_role only) and adds fan-out triggers on
`event_comments` and `event_reactions`. The Edge Function in the repo expects
those readers; the deployed v7 read `profiles.notify_event_push` directly and
knew nothing about comments or reactions. Order: apply 36 + 37, run their
TESTPLANs, then

    supabase functions deploy push-fanout --project-ref fdcncqnklscbztcydtye   # staging
    supabase functions deploy push-fanout --project-ref wvmnudcwcqktcugouqoe   # prod

Docker must be running (see the 2026-09-16 entry).

**Deployed 2026-09-18**, v9 on both projects (10:14 staging, 10:18 prod), after
the rewrite commit at 10:04. `stay-deadline-alerts` followed at 12:58 on both
(v10 staging, v11 prod) for the per-trip mute fix in the audit PR. Nothing in
this file is waiting on a function deploy any more — see the audit entry at the
top.

### FOUND — the signed fan-out trigger could never resolve hmac()

Migration 30 gave `notify_push_fanout()` `set search_path = public`, but Supabase
installs pgcrypto in the `extensions` schema, so `hmac()` does not resolve inside
it. The 37 dry run on staging hit this the moment the trigger's branch ran
(staging has `functions_url` and `cron_secret` set). Staging turned out to still
carry 27's unsigned body — 30 was never applied there — and push-fanout v7 only
accepts the signed headers, so staging pushes were being refused with 403.

37's `_push_fanout_post()` pins `search_path = public, extensions` and every
fan-out trigger now goes through it, which fixes both projects on apply. **Check
prod after applying** (the auto-mode classifier blocks prod reads from Claude):

    select left(prosrc, 200), proconfig from pg_proc
     where proname in ('notify_push_fanout', '_push_fanout_post');

Before 37, if prod had 30's body, every `trip_events` insert would have raised on
`hmac` — check-ins worked on 2026-09-17, so prod most likely still ran 27's body
too, i.e. prod pushes have been 403'd since push-fanout v7 (2026-08-04). Worth
verifying with one check-in after the deploy: the function's logs show the send
counts per audience.

## 2026-08-28

### DONE — deploy the digest Edge Functions (2026-09-16)

**Do this before followers start subscribing.** Departure is 31 Aug, and the
digests begin going out for real once family follow the trip.

The code is merged and on `main`; the copies running on Supabase are still the
old ones. Edge Functions do not deploy with Vercel — they ship separately, and
nothing sends them up automatically.

```
supabase login
supabase link --project-ref wvmnudcwcqktcugouqoe
supabase functions deploy digest
supabase functions deploy digest-send
```

Run from the repo root. The CLI picks up `_shared/resend.ts` and
`_shared/cronAuth.ts` on its own — both functions import them, which is also
why this is not a paste-into-the-dashboard job.

**What it changes:** the two functions stop discarding Postgres errors.

Today, if the database fails while `digest-send` is gathering a trip's events,
the query returns nothing, the trip reads as a quiet day, every subscriber is
skipped, `last_sent_at` is left untouched — and the run still reports success.
A total digest outage is indistinguishable from "nothing happened". After this
the reason is logged, and the run reports `fetchFailures` in its response.

`digest` (the subscribe/confirm/unsubscribe endpoint) had the same problem: a
failed upsert answered the follower "try again" and wrote nothing anywhere, and
a database error during the share lookup was reported as "invalid link" — the
most misleading answer it could give.

**No user-facing bug is fixed by this**, which is why it was left. It only
matters the first time something goes wrong, and then it matters a lot.

**Deployed 2026-09-16.** `digest` v6 → v7, `digest-send` v7 → v8, both ACTIVE
on `wvmnudcwcqktcugouqoe`. Two corrections to the recipe above, for next time:

- `supabase login` and `supabase link` were both unnecessary. The CLI was
  already authenticated, and `--project-ref <ref>` targets the project
  directly — which also skips the link step's database-password prompt:

      supabase functions deploy digest      --project-ref wvmnudcwcqktcugouqoe
      supabase functions deploy digest-send --project-ref wvmnudcwcqktcugouqoe

- **Docker must be running.** The CLI bundles in
  `public.ecr.aws/supabase/edge-runtime`, pulling it on first use (~700 MB,
  a few minutes). The second deploy reused the cached image and took seconds.

### DONE — sign-in works from any browser

Both Supabase email templates now point at `/auth/confirm`. Full account in
`docs/AUTH-EMAIL-TEMPLATE.md`, including the `{{ .Type }}` trap that cost two
test rounds. Magic Link is verified end to end; Confirm signup is correct but
unexercised until someone new is invited — treat the first invite as its test.

### CLOSED — Vercel project pause

While chasing the outage, `unpause_project` was called on the Vercel project
after misreading a `live: false` field. Petra confirmed 2026-08-28 that no
pause was deliberate, so the project is correctly left running. No action.

### WORTH DOING — put the email templates under version control

The sign-in outage happened because the Supabase email template is the only
part of the auth path with no version control. It lives in the dashboard, it
drifted from what `auth/confirm/route.ts` was written to receive, and no diff
anywhere could catch it — which is why it took a day and two wrong theories to
find.

Supabase supports managing templates in `supabase/config.toml` and deploying
them with the CLI, alongside the migrations already tracked here. Roughly half
an hour, needs no dashboard access, and turns that whole class of failure into
an ordinary code review.

**Half done, 2026-09-18.** `supabase/email-templates/` (README + both HTML
files) had been written on 2026-08-21 and left untracked — it is committed now,
so a change to a template is at least visible in a diff. The other half is
still open: there is no `supabase/config.toml` in this repo, so nothing ties
those files to the project, and the dashboard copy is still the one that runs.
Until that exists, a template edited in the dashboard and not mirrored here
drifts exactly as before — the repo only records what someone remembered to
copy back.
