# Project notes — open items

Running log. Newest first. Add an entry when something is left half-done, or
when a decision needs to survive the conversation it was made in.

---

## 2026-09-24

### BUILT — Money's forms lose the ✕ (Petra, 24 Sep)

Petra, after testing #88: Money's forms "still have an "x" and a slide down bar, both for
closing the page, but we agreed a few days ago that we should delete the "x" and keep the
other". The Trip sheets lost theirs on 23 Sep (the timeline's first day on the phone, below),
and `Sheet.tsx` says so. Money's three were built before that and kept it: the entry form, the
subscription form and the category list. Each now opens with its title alone and closes like
every other sheet: drag the handle down past 80 px, tap the dim strip above, or press Escape.
Pull request #89.

**Checked.** `tsc`; `eslint` (the same four old findings); 131 node tests; `next build`. In the
dev preview at phone width, none of the three has a Close button, and the entry form closes on
Escape, on a tap above it and on a 120 px drag of the handle, while a 40 px drag springs back.

**Next, Petra's idea (24 Sep):** search by name on All entries. "I had to swipe through the All
entries to find the iCloud subs … It would have made my search faster." It goes out as its own
pull request after this one.

### BUILT — Money stage 2, round 3a: the Subscriptions question, and charges that add themselves (mock 16 §7)

Petra, 24 Sep: "let's do round 3!" Round 3 goes out in three pull requests, one at a time:
- 3a, this one: the question on the entry form;
- 3b: the one-time offer for entries already in the category (§8);
- 3c: editing one-off costs on Money instead of on the Trip page.

Pull request #88.

**What changed.** With the Subscriptions category on the entry form (picked by hand, or
suggested from a name like Netflix, Spotify or iCloud), a Repeats block appears:
- **A new name:** Every month (preselected on a new entry), Every year, Other… (every 2 to 24
  months), or Doesn't repeat. Under the choices: "Next charge 24 Oct.", and "Remind me before
  each charge · 3 days before", on by default as in the mock. Saving declares the
  subscription, anchored on the entry's date. There is no second form, and the toast adds
  "· now a subscription".
- **A name that is already a live subscription:** "iCloud 2 TB is one of your subscriptions. Is
  this its 14 Sep charge?" (the nearest scheduled charge), with Yes / No. Yes links the entry
  and fills an empty amount and an untouched currency from the subscription: in Bangkok the
  currency box starts on THB, and a bill from home is HUF. No marks it a plain entry. Left
  unanswered, it is a plain entry too, so a second charge never makes a second subscription.
- **An entry that is a charge already:** the same block, set as its subscription is, so the
  cadence and the reminder can be corrected where the charge is.
- **An entry typed before round 3:** it opens with nothing preselected, so opening one to fix
  its amount declares nothing.

The link is one optional field on the entry, `subId`: the subscription's id, null once someone
said it doesn't repeat, and unset when never asked. There is no migration, because the ledger
is JSON.

"Suggested from the name" went behind an ⓘ beside Category (Petra, mock 16 round 2: too much
text).

**Fixed on the way.** A subscription declared from today's entry showed "Netflix today" in amber
on the Subscriptions line and card, as if the charge were still to come. The next charge now
counts from the day after the latest logged charge (`nextChargeFrom`).

**Decided in the build, open to change:**
- Editing a charge's name or amount does not change its subscription; the card edits those.
- Choosing Doesn't repeat on a charge unlinks it, and the subscription stays. It is cancelled
  or deleted on the card.
- The card's own "＋ Subscription" form still starts with the reminder off (#37). The question
  starts with it on (the mock). They may want to agree.
- Not built: "Lands in whichever journey is live". Subscriptions still belong to the journey.
  Carrying them to the next one (#59: the subscription belongs to the person) needs them stored
  per person, a database change: Patrik's call.

**Then, before the merge: charges add themselves.** Petra, looking at #88: "if we add a
subscription there and log when it will take the money off the card, can't it automatically
add the expense in the ledger?" This reversed #37's "the ledger rows are what confirms each
occurrence", so it went to Patrik. **Decided, Patrik, 24 Sep, relayed by Petra: yes.**
Recorded on #37. It was built into #88, so only one version ships.
- **The rule** (`subChargesDue`, `importCosts.ts`). Each subscription charge whose date has
  come is written to All entries as "· from Subscriptions", the subscription's amount on the
  charge date, linked by `subId`, with the source key `sub:<id>@<date>`.
  - Never a future charge: the projection already counts those.
  - Only inside the journey's dates, and only from `autoFrom`. That is the day after the entry
    that declared it, or the day it was added on the card. Older subscriptions start at
    `SUB_CHARGES_FROM` (25 Sep), so no month already logged by hand comes back. If the merge
    slips past 24 Sep, that date moves to the day after the merge.
  - Nothing is written where the charge is already logged: an entry linked to the
    subscription, or one with its name in Subscriptions, within 15 days. An entry said not to
    repeat does not count.
  - A deleted charge stays deleted (skip record). A cancelled subscription stops.
  - Written once, then the ledger's own: its amount and date can be corrected, and a price
    change on the subscription does not rewrite past months. The booking sync never updates,
    flags or removes these rows.
  - The same sync runs on Money, on All entries and, new, on Home, where the app opens.
- **Petra's safeguard** (`ChargeNotice.tsx`). Each charge written is announced in the toast's
  dark pill, but it stays until tapped: "iCloud 2 TB · 3290 Ft added to All entries, charged
  14 Oct." with "Cancelled it?" and "OK".
  - "Cancelled it?" asks first, in the same pill: its text becomes "Cancelled Spotify Duo?
    This 2490 Ft charge is removed, and Spotify Duo is marked cancelled from 17 Oct, so no
    more are added." with No / Yes, remove it. A first version used a dialog; Petra, on its
    picture, wanted the dark rectangle to stay where it is and only its text to change. No
    goes back to the first message. Yes removes the charge and marks the subscription
    cancelled on that date, so a cancellation never told to the app shows up at the next
    charge.
  - One at a time, oldest first, the last 30 days only. Each is remembered as seen on the
    device, so each traveller sees each charge once. Editors only.
  - With the reminder before each charge, every charge gets a check before it and after it.
- **The entry form:** logging a charge by hand whose row the app already wrote says "It was
  added by itself on 14 Oct. Saving this replaces it." Saving swaps the written row for the
  typed one. Nothing is doubled.

**Checked.**
- `tsc`; `eslint` (the same four old findings); `next build`.
- 131 node tests, eight new:
  - four for the question: `subNamed` (the whole name, any case or spacing, never a cancelled
    one), `nearestCharge`, `subFromEntry`, `nextChargeFrom`;
  - four for charges that add themselves: written once its date has come and from 25 Sep
    only; not again when written, deleted, logged by hand under its name or linked, but yes
    beside an entry said not to repeat; inside the journey, until a cancellation, from
    `autoFrom`; left alone by the booking sync after a price rise or a deleted subscription.
- In the dev preview with the clock on 20 Oct:
  - Money writes iCloud (14 Oct) and Spotify (17 Oct) and announces them one at a time;
  - "Cancelled it?" asks in place (no dialog), No goes back, and Yes removes the charge and
    leaves 3 active;
  - All entries lists both "· from Subscriptions", with an editable amount;
  - logging iCloud by hand offers to replace the written row;
  - Home announces the charge too.
- In the dev preview:
  - a new "Netflix" shows Every month, "Next charge 24 Oct." and the reminder on, and adds a
    fifth subscription with no "today" pill;
  - a second "iCloud 2 TB" asks about its 14 Sep charge, and Yes adds no subscription and
    fills 3290 HUF;
  - a second "Netflix" is recognised the same way;
  - Other… with 3 months gives "Next charge 24 Dec", and 40 greys out the button with "From 2
    to 24 months.";
  - an old iCloud entry opened from All entries asks, with nothing preselected;
  - the ⓘ opens "Suggested from the name. Tap another to change it."

**Live with #88.** Petra gave her go on 24 Sep, and the production build finished without errors.
Her two steps on the phone worked the same day: the Repeats block on a new "Netflix", and the
"Is this its … charge?" question on a subscription's name. The first charges the app writes
by itself can appear from 25 Sep, on a declared subscription's charge day, and each one is
announced.

### BUILT — Money gets shorter, step 2: three cards fold to one line (Petra, 24 Sep)

Petra, after step 1 (#82) on the phone: "it still feels long". She chose which cards fold:
One-offs & extras, Subscriptions and Bookings. The others are "too important to collapse":
the overview, Latest, the chart, Where it goes, and Plan, the one card that looks ahead.
Pull request #85.

**What changed.**
- **Each of the three starts as one line** (`Fold.tsx`): a title, a summary, and ⌄. Tapped,
  the full card opens in place, with ⌃ at its top to fold it again. ⌄ opens in place and ›
  goes to another screen, so the two never look alike.
- **The summary carries anything that needs attention.** Folded, the warnings each card
  shows would otherwise sit behind a tap. On Asia's test data:
  - Bookings: "1 432 421 Ft · 418 200 Ft not booked yet", the not-booked part in amber; or
    else what is still to pay, or "all paid".
  - Subscriptions: "4 active · ≈ 15 270 Ft a month", plus the charge due within a week in
    the open card's amber pill, e.g. "· Home internet · Budapest flat in 2 days"
    (`chargeSoon`, `lib/trips/subscriptions.ts`).
  - One-offs & extras: "629 000 Ft planned · 491 100 Ft paid · 1 not paid yet", the
    columns side by side and never added, as on the card.
- **They start folded each time the app is opened.** One that is opened stays open while you
  move around the app (module state, like the Track question's), so a trip to All entries
  does not fold it again.
- **The quiet page is unchanged.** Its Bookings card is the whole page there, so it shows open
  and without ⌃. The open Bookings card still taps through to the Trip page from its figures.
  Its header now holds ⌃, and a button cannot sit inside a link.
- **Empty cards are not folded.** They are one sentence already.
- **Money is 2 622 px, about 3.1 phone screens.** It was 6.9 before step 1 and 4.5 after it.

**Checked.**
- `tsc`; `eslint` (the same four old findings); `next build`.
- 123 node tests, one new: `chargeSoon` counts today, skips cancelled subscriptions, and
  looks only a week ahead.
- In the dev preview at iPhone 13 width:
  - each row opens with ⌃ and folds again;
  - the open Bookings figures link to the Trip page;
  - with the clock on 21 Sep, the Subscriptions line names the internet bill "in 2 days";
  - the quiet page shows Bookings open, with no ⌃.

**Then the rows moved below Plan (Petra's choice, 24 Sep).** Offered as a picture before the
merge, with the cards moved in the browser only. The page now shows the big cards first:
overview, Latest, the chart, Where it goes, Plan. It ends in one group of lines: Bookings,
Subscriptions, One-offs & extras, Budget cap, All entries. On a new journey, before Plan
unlocks, the rows follow Where it goes, and "More appears as you log" stays last. The
preview checked both orders.

**Live with #85.** Petra gave her go on 24 Sep, and the production build finished without errors.
Her test on the phone passed every step:
- the five rows sit below Plan;
- the three folded rows show their summaries, with warnings in amber;
- each opens, and ⌃ folds it again;
- the open Bookings figures lead to the Trip page.

**Then Budget cap went last (Petra, 24 Sep, after the phone test).** Her reason: it is the one
row that takes you out of Money, to Settings. All entries also goes to another screen, so
the rows now run from the three that open in place (⌄) to the two that go elsewhere (›):
All entries, then Budget cap. Budget cap's second line also got the 14 px of the rows around
it. Pull request #86.

**Not built: recolouring the Budget cap row.** Petra asked for Claude's honest view of it. Two
mock-ups were made in the browser only: the row in the Track spending switch's colours, and the
same colour with a quiet "Settings" label before ›. Claude advised against the colour:
- on this page colour carries meaning, the soft tag colours for the Track spending switch and
  amber for a warning;
- a coloured Budget cap row would look like a second switch or a notice;
- it would pull the eye to the least-used row;
- it would compete with the row's own amber, "at this pace the journey goes … over it".
The label says where the row leads without any of that. **Petra chose the label**: "Settings ›"
in grey, the same size as the rows' second lines. When no cap is set, the second line drops its
"…, in Settings", which the label now says.

**Live with #86.** Petra gave her go on 24 Sep, and the production build finished without errors.
Her test on the phone passed:
- All entries, then Budget cap, are the last rows;
- Budget cap shows "Settings ›";
- tapping it opens Settings.

---

## 2026-09-23

### BUILT — Home's money card follows Money's projection rule (Petra, 23 Sep)

Decided by Petra the same day, with Patrik's "we can continue on". Money waits a week of pace
before it projects (round 2), but Home's card said "Spent X of ≈ Y projected" from the first
day. Pull request #83.

**What changed.** On a journey made after round 2, the card now shows:
- until there is a daily pace (days 1–2): "Spent X so far · measuring your daily pace";
- once Money's Per day has a figure (day 3 on): "Spent X so far · 24 739 Ft/day everyday in
  Bangkok · a projection after a week";
- once the projection unlocks: as before, "Spent X of ≈ Y projected · … · under/over the
  estimate".

Home asks `moneyUnlocks` with the same inputs as Money: the saved cards, the creation time,
and the same UTC calendar day (`useToday` and Home share it). So the two never disagree, and
a journey from before round 2, like Asia, shows what it always did. Before departure, Home's
"Estimated total" card (city averages) is unchanged.

**Checked.**
- `tsc`; `eslint` (the same four old findings); 122 node tests; `next build`.
- The dev preview's Home (`?screen=home&day=N`, the browser clock set to the day), a new
  journey:
  - days 1 and 2: "so far · measuring your daily pace";
  - day 4: "so far · 24 739 Ft/day everyday in Bangkok · a projection after a week";
  - day 8: the projection appears, ≈ 3 663 739 Ft, the same day and figure as Money's Plan;
  - day 9: ≈ 3 467 086 Ft, as on Money.
- Asia today: unchanged.

**Live with #83.** Petra gave her go on 24 Sep, and the production build finished without errors.
She checked it on her phone: Asia's Home card still says "Spent … of ≈ … projected".

### BUILT — Money gets shorter, step 1: the ledger on its own screen, All entries (Petra, 23 Sep)

Petra, looking at the round 2 pictures before that merge, had two findings. First, the
ledger's top was confusing: "I expect to see my added expenses and incomes there but it
starts with something else entirely". Second, the page was "so so long… future users will
think of it as boring". Measured on Asia at phone width, the page was 5 813 px, about 7
screens:

- the ledger alone was 2 080 px (36%);
- the four planning cards (Bookings, Subscriptions, One-offs, Plan) were 32%;
- the overview, Latest, the chart and Where it goes were 24%.

Pull request #82. It also closes #38, Patrik's issue of 19 Sep about the ledger burying the
cards below it, which already named this fix: "give it its own route and leave a summary row
on the Money page".

**Decided (Patrik, 23 Sep, after Petra showed him the pictures).** He loves the change: the
ledger can and should get its own screen, and it gets a plainer name than ledger, a word Petra
had not met before. Offered "All entries" (the words Latest's link and the + button already
use) or "History", Petra chose **All entries**. Recorded on #38.

**What changed.**

- **The ledger has a screen of its own**, All entries at `/money/entries`. Its header reads
  "‹ Money", "All entries", "Asia · 43 entries · tap a row to edit". Three ways lead to it:
  - Latest's "all entries ›";
  - a one-line "All entries · 43, newest first ›" row at the bottom of Money. This is the way
    in that always exists, because Latest shows nothing on a journey whose only rows are
    bookings;
  - a chart bar's "Open in All entries", which opens the screen at that day (`?day=`).
- **The word ledger is gone from the screens.** Beyond Money and All entries, it was in the
  One-offs ⓘ ("paid is a ledger row", now "an entry in All entries"), on Home after a trip
  ("the full ledger, month by month", now "all entries, month by month", linking to All
  entries), in the delete-journey warning, in the welcome questions ("shared ledger", now
  "shared costs") and on the delete-account page. The code keeps the word: the data is still
  `trips.ledger`. **Left for Patrik:** the Terms and Privacy pages say "your money ledger";
  they are legal texts.
- **Rows edit and delete there exactly as on Money.** The sheet, with what saving and
  deleting mean, moved into `EntryEditor.tsx`. The plan → ledger sync moved into
  `usePlanSync.ts`, and both screens run it, so a one-off's payment removed on All entries
  disappears there, not only on the next visit to Money. Adding stays on Money. The
  screen is in the offline warm-up list.
- **Money is 3 807 px, about 4.5 screens** (from 6.9).
- **The ledger opens on what was logged.** Rows dated after today fold into one closed line at
  the top, "Scheduled · 1 payment · 433 840 Ft". Opened, it lists them soonest first, with
  "Dated after today, so not counted as spent yet." The "Today" band is gone.
- **Fixed on the way, a mistake live since 15 Sep (0446093).** The month total counted the
  scheduled rows while the box beside it said "not counted as spent". September on Asia's test
  data showed 563 548 Ft, of which 433 840 Ft was the stay charged on 29 Sep. It shows
  129 708 Ft now: month and day totals count only rows up to today (`lib/trips/ledgerView.ts`).

**Checked.**

- `tsc`; `eslint` (the same four old findings); `next build`.
- 122 node tests, three new: the scheduled stay folded away and counted in no total; soonest
  first, with today counted as spent; no single total when an income is scheduled.
- In the dev preview (`?screen=entries`, `&show=YYYY-MM-DD`) at iPhone 13 width:
  - Money's height;
  - the All entries row and Latest's link go to the new screen;
  - the chart's link goes to the screen at that day (`?day=2026-09-23`);
  - All entries opens on the closed Scheduled line, then September 129 708 Ft, then today,
    and the line opens;
  - a tapped row opens the sheet;
  - `?show=2026-09-05` opens the screen scrolled to that day;
  - removing "Visas · TH ext, VN e-visa ×2" (from Extras) asks "Remove this payment?", and the
    row goes.

**Before the merge.** Patrik saw the pictures first, because the ledger leaving the Money page
changes how he uses it every day too, and approved (above).

**Live with #82.** Petra gave her go on 23 Sep, and the production build finished without errors.
Her test on the phone passed every step:
- Money ends with the All entries row, with no long list;
- the screen opens, and its Scheduled line opens and closes;
- September's total looks right;
- a tapped entry opens the edit form;
- a chart bar's "Open in All entries" opens the screen at that day.

**Step 2, not started.** If Money still feels long on the phone, Bookings, Subscriptions,
One-offs and Plan become one-line summaries that open on tap, which could bring the page to
about 3 screens. This gets decided once step 1 is on the phone.

### BUILT — Money stage 2, round 2: the cards arrive as entries do (mock 16 §6)

Asked for by Petra the same day, after #80. Pull request #81.

**What changed, on a journey made from now on.** Money starts short and the cards arrive as
entries do, by the mock's table (`lib/trips/unlocks.ts`, the numbers in `UNLOCK`):

- the overview and the ledger with the first entry, the plan's rows included;
- the "beyond the everyday" line once a stay, fare or one-off is paid on or after the start;
- Daily spend at 3 days with everyday entries, drawn over the days there are (from the first
  one, at most 14 back), with no 7/14/30/90 switch or arrows until 14 days;
- Where it goes at 3 colour families;
- the Projected total tile, the Plan card and the cap row's "at this pace…" after 7 days of
  pace, and never before the chart;
- as the last line, "More appears as you log: a chart after 3 days, a projection after a
  week.", naming only what is still to come, until both have come.

Per day keeps its "measuring… 1 of 3 days". Latest, Bookings, Subscriptions, One-offs and the
Budget cap row show from day one, as before (the Subscriptions and One-offs rules are round 3).

**A card never goes away.** The day each of the four data-hungry cards first qualified is saved
in the journey (`state.moneyUnlocked`; no migration, the trip document is JSON) by whoever can
edit it, and a viewer reads what they saved, so deleting or re-dating entries never takes a card
back off the page.

**Journeys that already existed keep everything.** Caught in the preview before the pull
request: the Asia test data has 12 days with everyday entries, and its 7/14/30/90 switch
vanished. A journey created before 09:45 UTC on 23 Sep (`ROUND2_SHIPPED`, when the pull request
was opened) looks as it did: every card, the overview and its strip included, also before
departure or with nothing logged. That comes from its creation time on every view and is never
saved, so opening Money saves nothing to an existing journey: a save there would bump the
journey's version and could turn a partner's save at the same moment into a conflict. The line
is a moment rather than a day so that a journey made after the merge starts short at once,
which also makes round 2 testable on a fresh journey today. If the merge slips past 23 Sep, the
line moves to the merge time; otherwise a journey made in between loses the cards it had.

**Checked.** `tsc`; `eslint` (the same four old findings); 119 node tests, ten new: the mock's
days, a week of pace with nothing logged (no projection), the switch at 14 days (the plan's
rows and future dates do not count), a saved card staying, an old journey having everything
and nothing to save, the line between old and new journeys (whatever offset the timestamp
carries); `next build`. Reading the diff before the pull request caught one more: the cap row
said "% spent" whenever there was no pace yet, and a first version asked only whether the
projection had unlocked, which an old journey before departure always has; it asks both now. In the dev preview at iPhone 13
width, with the new `?day=N` replay (the journey as of its Nth day, dated as made after round
2, the browser clock set to match): day 1 measuring, no chart and no projection, the last line
naming both; day 4 the chart without its switch, "24 739 Ft everyday costs over 3 days in
Bangkok", the line naming the projection; day 9 the projection and Plan, and the cap row's "at
this pace the journey uses 77% of it", the mock's own number; today (an older journey) every
card, the switch included. In the browser's saved copy: day 4 saves chart and Where it goes,
day 9 adds the projection, the older journey saves nothing.

**Live with #81.** Petra gave her go on 23 Sep, and the production build finished without errors.
She checked Asia on her phone: it looks the same, every card still there.

**Petra's question before the merge: why does the Plan only come up after day 9?** It comes on
day 8, after 7 days in Bangkok; the pictures jump from day 4 to day 9, the mock's days. It waits
because every figure on it is the stay plus the daily pace times the nights, and the first days
run high: 24 739 Ft a day on day 4, 15 274 Ft on day 8, 5 401 Ft on day 24. Her point stands for
a journey still being planned. The card is called Plan, yet Money now shows no estimate for the
whole journey until day 8 of the trip; before round 2 it showed one from city averages. The
proposal for Patrik was the Plan card from day one on city averages, labelled so, switching to
"at this pace" after the week. **Withdrawn the same day (Claude's correction).** Home already
shows an "Estimated total" from city averages before departure ("city averages, not your
numbers"), so a journey being planned has its estimate. The Plan card keeps waiting a week, and
there was nothing for Patrik to decide.

**Still to say (Patrik).** Only the 7 days is his (22 Sep); the chart at 3 days, the switch at
14 days, Where it goes at 3 families and "a card never disappears" are the mock's proposals.
And whether journeys made before round 2 should start short too (as built, they keep every
card).

**Home's money card, decided by Petra on 23 Sep** (Patrik: "we can continue on"). It still
says "Spent X of ≈ Y projected" from day one, while Money waits 7 days for its projection. It
follows Money's rule, in its own pull request after #82. On a new journey:
- days 1–2: "Spent X so far · measuring your daily pace";
- days 3–7: the daily figure, like Money's Per day, and "a projection after a week";
- from the unlock: as today.

Older journeys keep what they show.

**Not in this round.** The one-line Subscriptions door on a journey longer than a month, the
Subscriptions question on the entry sheet, the one-time offer and the One-offs editor on Money
are round 3.

### BUILT — Money stage 2, round 1: the question and the quiet page (mock 16 §1–2)

Asked for by Petra the same day, right after migration 41 went live; the globe question
waits for a talk with Patrik.

**What changed.** The first visit to Money asks, once per account, "Track what you spend on
this journey?" in a sheet (`TrackQuestion.tsx`): "Log a coffee, see what a day here costs.",
"Yes, track it", "Not now", and "Asked once. Your bookings are here either way." Only the two
buttons answer; sliding it away, tapping beside it or pressing Escape closes it until the app
is next opened. Behind it, someone who already logs costs on the journey sees their own page
and a newcomer sees the quiet page. Yes is today's full page, which gains a "Track spending"
switch next to the Budget cap row, "Only for you." (`TrackSpendingRow.tsx`), hidden while the
answer cannot be read. Not now is the quiet page: the Bookings card, the add button
and "Spending isn't tracked on this journey. Track it ›". The page never says ledger. Saving
a cost from the quiet page's add button turns tracking on; the form says so above its
button, "Saving this turns on spending tracking.", and the full page opens with the cost in it.

**Changed before the merge (Petra, looking at the pictures), three things.** The mock's list
of what you add after saying no, titled Spending, is gone: spending listed right under
"Spending isn't tracked on this journey" made no sense, and for anyone who logged before
saying no it was the whole ledger again. Without the list, a cost added on the quiet page
had nowhere to show, so her next two ideas followed. The add button stays, as #62 decided,
and saving a cost from it turns tracking on, reversing the mock's "logging one visa fee does
not flip the answer": wanting to log is the answer, and one-offs like a visa fee have their
own home now, the extra's paid-on date. And the switch moved from the Account page, where the
mock put it "under your avatar", to the full Money page, where people look for it; its line
says the answer is personal, because a switch on a journey's page reads like a setting for
everyone on it, and Patrik's Money page does not change when Petra flips hers.

**Then she asked whether it was all intuitive, and two more things changed.** A swipe no longer
answers: in the mock, sliding the sheet away counted as Not now ("asked once"), but panels get
swiped away out of habit, and for Patrik and Petra the first visit would have hidden 23 days of
spending behind the quiet page until "Track it". Now only the buttons answer, a swipe closes
the question until the app is next opened (module state in `MoneyPage.tsx`, so moving between
tabs does not bring it straight back), and whoever already logs costs sees their own page
behind the question (`hasLoggedSpending`: costs typed on Money; the plan's rows do not
count). And the switch's line lost "on every journey", which read as a contradiction of the
question's "this journey". That sentence is Patrik's (#62) and the answer does count for every
journey; it only shows once a second journey starts.

**How the answer is read.** `profiles.track_spending`, read by `useTrackSpending` into four
states (`lib/trips/tracking.ts`): ask, yes, no, unknown. Money waits for it only on a
device's first visit, since it is cached and persisted like every query, and a failed read
falls back to the full page with no question. Saving is optimistic, so the page changes shape
at once, and a failed save puts the old answer back with the save banner.

**Checked.** `tsc`; `eslint` (only the old SettingsClient error and three old warnings); 109
node tests, three new: the four states, which of them get the quiet page (a tracker behind the
question does not), and which costs count as logged; `next build`. In the dev preview
(`/dev/money-preview?track=ask|no|yes`, and `&logged=0` for a newcomer) at iPhone 13 width,
with its database calls held open so a save stays in flight: the question over a tracker's
own page and over a newcomer's quiet page; a tap beside it, Escape and a drag on the handle
each close it and leave the answer unset, and it is back when the app is opened again; Yes
opens the full page; Not now keeps the quiet page; the quiet page lists no spending; its add
button's form shows the note, and saving opens the full page with the new cost in Latest;
Track it opens the full page; the switch, "Only for you.", sits under the Budget cap row, and
switching it off gives the quiet page.

**Live with #79; on the phone, and one more move.** Petra's test on the phone passed at every
step: the question over her own page, a swipe only closing it, the question back after
reopening the app, Not now giving the quiet page, Track it bringing the full page back, and
the switch under the Budget cap row. Then she moved the switch (#80): at the bottom, next to the
Budget cap row, you had to scroll to nearly the end to notice it exists. It now sits right
under the first card on both versions, one control in one place: under the overview on the
full page, on, "Only for you."; under the Bookings card on the quiet page, off, "Spending isn't
tracked on this journey.", where the "Track it ›" line was. It takes that line's look, the
soft tag colours with "Track spending" in its mauve ("the same look as when someone only sees
the bookings"), and it is slim, because trackers see it every day between the overview and
Latest. It mirrors the page shown, so someone who closed the question can also answer with it.
Live with #80; Petra confirmed it on the phone the same day.

**Not in this round.** The cards that unlock as entries arrive and "More appears as you log"
are round 2; the Subscriptions question on the entry sheet, the one-time offer and the
One-offs editor on Money are round 3. As built, every existing account is asked once; the
backfill alternative for Patrik is in the migration 41 entry below.

### DECIDED — Patrik, 23 Sep: the per-night line goes; the globe question is Petra's

- **The per-night line under a city's opened sum on the Plan card is dropped.** It closed the
  sum with "Bangkok costs 35 446 Ft a night on average, the stay included", kept since the owner
  review of 19 Sep for comparing cities. Petra found it confusing on the phone and would drop
  it; Patrik let it go. It was the only all-in nightly figure in the app: the stay sheet's
  nightly price is the stay alone. Removed in #78, the pull request that carries migration 41,
  so it went live with that merge; Petra confirmed it on the phone. Recorded on #62.
- **Version A of #63, the timeline as a sheet over the globe, is Petra's to decide.** What the
  phone test argued for is in the MOCKED entry of 22 Sep: the timeline as its own page (live
  since #68), the globe staying on Map, and "the globe sleeps behind the sheet" as a
  precondition before version A is tried on a phone again. Recorded on #63.

### APPLIED — migration 41, `profiles.track_spending`, on staging and production (Petra, 23 Sep): the first step of Money stage 2

**Applied by Petra in the Supabase dashboard's SQL editor**, on Patrik's say-so ("it will be good
practice for her and she can learn what these are"), guided step by step. The address bar
stood in for the PROD prompt of `tools/db.sh`: every step began by checking the project ref in
it. Staging, `fdcncqnklscbztcydtye`: the migration, then `41-TESTPLAN`, both "Success. No rows
returned"; the test plan raises on any failure, so success is silence. Production,
`wvmnudcwcqktcugouqoe`: the migration, then a read-only check of `information_schema.columns`,
one row, `track_spending | boolean | YES | NULL`. The test plan was not run on production: its
fixtures are pretend accounts. The backfill question below is still open; it matters only
from the day stage 2 ships.

**What it is.** One nullable boolean on `profiles`, the answer to mock 16's once-per-account
question "Track what you spend on this journey?": null = not asked yet, true = "Yes, track
it", false = "Not now". No new permission: `profiles_update` (03) already confines each
person to their own row, and the two guard triggers look only at `is_admin` and
`active_trip_id`. Nothing reads the column yet; the stage 2 app code will, so it goes to
production before that code does.

**The same steps from a terminal, for next time.** Each stops on the first error; the prod step asks for the word PROD.

    tools/db.sh apply 41            # staging
    tools/db.sh test 41             # staging; rolls itself back
    tools/db.sh --prod apply 41     # production

Then merge the pull request that carries the two files, so `main` says what is live.

**Dry run, 23 Sep, before anyone touched a real database.** A throwaway local Postgres 16
with `profiles` rebuilt from the real text of 03 (table, signup trigger, `is_admin()`, the
policies, the admin guard), 06 (the co-member read) and 07 (`active_trip_id` and its
guard). 41 applied twice without error; existing accounts stayed null; the test plan passed
twice and left no users or trips behind. It also failed, each time with its own message, on
every broken variant tried: 41 not applied, a default of false, NOT NULL, the update policy
dropped, the update policy loosened to anyone, the co-member read missing (the fixture
guard). The first version of the test only tried a stranger's row, which RLS hides anyway,
so the loosened policy passed; it now tries a travel partner's row, which is readable.

**The decision inside it: no backfill (Patrik to confirm).** Every account that exists when
41 runs, Patrik's and Petra's included, is asked once, on its first visit to Money after the
stage 2 build ships. Why: the ledger records no author, so "who already tracks" could only be
guessed from trip membership, and the mock rules that out for a travel partner ("the answer
is theirs, not the journey's"); one tap each costs little; and it lets the two of them see the
question live on their own phones. The alternative, if nobody who exists today should be
asked, is one more statement; the fixed cutoff keeps a later re-run from answering for anyone
who signs up after it:

    update public.profiles set track_spending = true
    where track_spending is null and created_at < timestamptz '2026-09-24 00:00:00+00';

### BUILT — Money, stage 1 of mock 16: calmer before quieter

Branch `kyh/cool-euler-7jcmqu`, the afternoon the timeline went live, with Petra on the
phone. Mock 16 splits into two builds: what makes the page calmer needs no data change and
is this one; the quiet start needs a per-account answer and is stage 2.

**What changed.** The overview's budget line says only "18 % of your budget" and what is
left; the cap amount lives in its own row, whose line reads "N % spent" until there is a
pace and "projected uses N %" after. A "Latest" strip with the last three entries sits right
under the overview (`LatestStrip.tsx`, "all entries ↓" jumps to the ledger, which stays last,
#38), and saving an entry shows the two-second toast, "Added · 35 100 Ft · Airport (food,
drinks)". One-offs keeps its two columns and gains a line per row, what the paid figure is
("backpack · 20 Aug") or "nothing paid yet" in amber; the two-column explanation went behind
ⓘ. The Plan card leads with the projected total, then one short line per city with the stay
state in words (amber where nothing is booked); a tap on a city opens its sum in three lines
that add up to the row, closed by the per-night figure Patrik wanted kept (2026-09-19);
transport, one-offs, the remainder and subscriptions ahead sit behind "How it adds up". Copy
diet (#65): the sentences under Bookings, Where it goes and the "beyond the everyday" box are
gone or one line; the Subscriptions empty state says "Repeating costs, like Netflix or iCloud."

**Round two on the phone (Petra, 23 Sep, after the merge).** Latest shows only what was
logged by hand: an imported booking is dated by its charge date, which can lie in the
future, so the Hanoi stay charged in October sat at the top of a strip about today. The
entry sheet no longer puts the cursor in its first field on opening (nor do the stay and
stop sheets): on the iPhone a keyboard that opens the instant a sheet appears shifts the
sheet before it has settled and leaves a blank band under it; a tap opens the keyboard
cleanly. The Budget cap row says in words what the journey does to the cap, "at this pace
the journey uses 77 % of it", or in amber "goes 937 111 Ft over it"; "projected uses 132 %"
meant nothing to her. The per-night line under a city's opened sum now reads "Bangkok costs
35 446 Ft a night on average, the stay included"; Petra would drop the line, Patrik asked for
the number on 19 Sep to compare cities, so it stays until he says otherwise. One finding
was data, not code, and pointed at a gap: Insurance and visas read "nothing paid yet" because
they were entered as planned extras (the Extras list, which had no date) and the payments
were never logged on Money; the Paid column counts only ledger rows. A one-off had to be
typed twice, once as a plan and once as a payment. Petra asked for that in this same merge
rather than in stage 2, so it is here: an extra has a "Paid on" date (`Extra.paidOn`, blank
= planned), and the import that writes a booking's row on its charge date writes the
extra's row on that date (`importCosts.ts`, source kind `extra`, id `le-plan-extra-<id>`),
keeps it in line with the amount and label, and, the one departure from the booking rules,
DELETES the row when the date is cleared while the extra is still listed: "not paid after
all" must not leave the money in "spent". Deleting the extra itself leaves the row flagged,
like a booking. Removing the imported row on Money clears the extra's date (one write; no
skip record for extras). Two things came out in the reading. The extras form stores its own
words ("Insurance", "Visa") while the ledger stores registry ids ("insurance"), and the
One-offs card paired its two columns by raw category, so "Insurance" planned and
"insurance" paid would have been two rows the moment anything was paid; both sides now go
through one bridge (`lib/trips/extras.ts`: Visa and Insurance → insurance, Vaccines →
health, Gear → gear, Flights (intl) → transport, SIM/eSIM → connectivity, anything else →
other), and the Paid column also counts every row that came from an extra whatever its
category. And a row the plan wrote is never day-to-day: `everydayOnly`, the burn rate and
"beyond the everyday" skip rows with a `source`, so a vaccine paid mid-trip does not lift
that week's rate (a no-op for existing data, since stays and fares were non-daily already).
The Extras list says "paid 12 Aug" or "not paid yet" under each item; the ledger badge reads
"from Extras". Not in the projection twice: extras were never added to the projected total,
and the payment enters `spent` the way any ledger row does.

**Round three on the phone (Petra, 23 Sep, after #74).** She set "Paid on" on the insurance
and the e-visas; both rows landed in the ledger, and the One-offs card read "Insurance & …
290 304 Ft | 290 304 Ft" with one line under it, "2 E-visas (Vietn…". Her reading: "the
e-visas entry is not there, but when I click on Edit extras, it's there." The numbers were
right (the heading is the category, and insurance and visas are one category, so the row
held both); the card hid it three ways: the phone cut the heading, the line under it named
only the latest payment, and that line was cut too. The card now (#75) lists, under each heading,
every extra of that category by name with where it stands ("paid 12 Aug", "scheduled
2 Oct", "not paid yet" in amber, "switched off" when unticked but paid), and one line for
the payments typed on Money ("Osprey backpack · logged 20 Aug", or "… and 2 more · last
logged …"). The heading wraps instead of truncating. The grouping moved out of the
component into `oneOffs()` in `lib/trips/extras.ts`, with tests built on her card's exact
numbers. One rule changed with it: an extra that is unticked but paid is listed and counted
in Paid, never in Planned, and the "switched off" note at the bottom counts only unticked
extras that are unpaid, so its "no total here counts" stays true.

**On the phone after #75 (Petra, 23 Sep).** Both extras listed under "Insurance & visas"
with their dates (insurance paid 6 Aug, e-visas paid 15 Sep), the heading whole on two
lines, and "Bank transaction fee and 1 more · last logged 18 Sep" under Fees & cash. Her
question: why the Total row's two numbers differ (290 304 Ft planned, 295 070 Ft paid). The
gap, 4 766 Ft, is the two bank fees: paid on Money, never on the Extras list, so they sit in
Paid with a dash under Planned. That is the card working as designed (two columns, never
one total; the gap is the number worth seeing), but the Total row invites the question, and
the ⓘ text did not answer it: it explained that one cost can sit in both columns, not that
Paid also holds payments nobody planned. Offered to leave it or add one sentence to ⓘ, Petra
chose the sentence: "Paid also counts payments you never planned, like bank fees." It sits
after "…never added together", so the card stays as quiet as before until ⓘ is tapped.
Live with #76; Petra saw it on the phone. Her next ask: only the paid total bold in the
Total row, the planned total regular, "to anchor the essence of this whole rectangle". It
also made the card consistent: every row above already had Paid bold and Planned regular,
and the Total row was the one place with both bold. Live with #77; Petra confirmed it on the
phone the same morning.

**Stage 2, not started.** The once-per-account question and the quiet page for No (a
`profiles` column, a migration Patrik applies), the cards that unlock as entries arrive
(mock 16 §6, projection after seven days), the one-line Subscriptions door on a journey
longer than a month, the Subscriptions question on the entry sheet with its cadence chips,
the one-time offer for entries already in the category, and the "More appears as you log"
line. The Extras editor stays reachable only from the One-offs card until stage 2 gives the
card its own.

## 2026-09-22

### BUILT — the Trip timeline off mock 15 (§1, §4, §5, §6): #58, with #60's stay form

Branch `kyh/cool-euler-7jcmqu`, on the shipped tokens; nothing is deployed until the pull
request is merged. Preview without a sign-in: `/dev/trip-preview` (development only, the
Money fixture with the stays and legs the mock shows).

**What changed.** `/itinerary` is one timeline (`components/trips/Timeline.tsx`): home, leg,
stop, leg, stop … home, in date order, no tabs. Legs are pale-mauve strips between the stop
cards and the only place transport is entered; stops are white cards with their stays
underneath, one row per stay with its nights, its money state and its total; the amber
"No bed 30 Nov → 13 Dec" row inside a stop opens Add stay with those nights already in;
"+ Add stop" sits above the way home, which is a dashed "not planned yet" leg into the home
node. Three bottom sheets replace the centred modals: the stop editor (`StopSheet`: Arrive,
Leave and the "moving Leave moves the Hanoi leg with it" line, Comfort behind ⓘ with the
city's three nightly bands, the stop's stays, Delete below a rule), Add stay (`StaySheet`:
check-in/check-out, per night with the base-currency line, Idea / Booked, and for Booked the
two deadline dates each with an "or" and its explicit no, the reminder switch appearing once a
cancel-by date exists, on by default and saying where it shows), and transport on the leg
(`LegSheet`: from, to and day from the stops, type chips, Departs + Time, the optional
Connection for flights, Price, Idea / Booked with the charge date, Remove under a rule).

**The document.** No migration: five optional fields on a stay (`checkIn`, `checkOut`,
`noFreeCancel`, `chargeAtCheckIn`, `remind`) and three on a transport leg (`time`, `via`,
`hours`). Legs are DERIVED, never stored (`lib/trips/timeline.ts`): the space between two
consecutive in-plan stops plus home → first and last → home, with transport attached by the
same normalised from/to match the globe uses; an entry that matches no leg lists under the
timeline as "Transport not on a leg". `stayNights` prefers the stay's own dates, then the
typed override, then the stop, so every stay written before this reads as it always did.
Two states everywhere: 'booked' (and the legacy 'chosen') is Booked, anything else is Idea;
`include` still means "counts in the plan" for the budget and is set true on every save from
the new sheets (an Idea with a price forecasts it); a stay left unticked on the old Stays tab
shows as "old option · not counted", with a switch in its sheet to count it. Deadline
reminders now also require Booked (an Idea's dates are hidden and are not a deadline) and
respect the switch, in `reminders.ts` and in the `stay-deadline-alerts` function; "At
check-in" mirrors the check-in date into `chargeDate`, so the ledger import and the Money
page need no new branch. Moving a stop's Leave moves the leg after it: entries leaving that
city on the old date follow (`shiftDepartures`).

**Kept on purpose.** `?tab=extras` still renders the old Extras editor behind a "← Trip"
link, because the Money page's One-offs card links to it; it goes when mock 16's One-offs
editor is built. Home comes from the trip's `homeBase` for now (#58 wants it on the person);
the journey picker in the title (#21) is not built, the trip name is the title.

**Not in this build.** The globe-and-sheet shell (§2), which waits on the phone test recorded
in the MOCKED entry below; the tab-bar rule (§7), which depends on that decision; the
Deadlines row in Trip settings (#60's second door).

**Verified.** `tsc` clean, `eslint` clean but for a warning that predates this, 96 node tests
(12 new, `timeline.test.ts`), `next build` green, and phone-width screenshots of the
timeline in both themes and of every sheet from the preview.

**Day one on the phone (Petra, iPhone 13, 23 Sep, after the merge).** Three findings, three
fixes in the follow-up pull request: (1) no sheet could be dismissed on the phone, a tall
sheet leaves almost no scrim to tap and there was no other way out, so every Trip sheet
now carries a ✕ and `Sheet.tsx` closes on a drag of the handle past 80 px (a shorter drag
springs back); (2) the Hanoi → Hong Kong flight sat under the timeline as "not on a leg"
with no way forward, because Hong Kong is not a stop yet and a leg only exists between two
consecutive stops: the entry's sheet now says so, offers "+ Add Hong Kong as a stop"
(Add stop opens with the city, its country from the catalogue and the flight's day filled
in) and "move it onto a leg", and the list under the timeline explains itself in one line;
(3) the chart's average was hidden behind a tall bar (#66): the number now sits at the top
right of the chart, above the tallest bar, where nothing can cover it. Round two, same day,
after the fixes went live: the ✕ goes again, two ways to close on one sheet read as two
versions of it, the handle and the scrim stay; "Hong Kong" now finds the stop "Hong Kong
Island" (`sameCity` in `lib/map/norm.ts`: one name is the other plus more words, used by the
timeline and the globe alike; the "move it onto a leg" picker stays for the rest); and the
average, first moved to the title line as mock 16 §4 had decided, moved on to the corner of
the chart because the title line got too busy. Mock 16 §4 updated to match. Two more observations belong to the Money build (mock 16, not
started): the budget line still shows the cap amount squeezed on the right, and the page
carries too much text. Extras being reachable only from the Money One-offs card is the
design, until that card grows its own editor.

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
