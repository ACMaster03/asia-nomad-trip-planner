# The web app in the iPhone app's image

Started 12 Oct 2026 by Petra, on Patrik's ask: make the web app look and work like the
iPhone app. This file is the comparison (what the phone does differently from the web,
screen by screen) and the plan (the rounds, each one a pull request merged with a "go").
Patrik decides the order and the open questions at the end.

The source of the look is the iPhone app on the branch `feat/ios-foundation` (TestFlight
build 24, 10 Oct), not the older copy of `ios/` on `main`. Its component vocabulary is in
`ios/Livhold/Components/` and `ios/Livhold/Gallery/GalleryView.swift`.

Words used here: a **round** is one pull request; a **kit** is a set of shared building
blocks (a card, a button, a header) that every screen uses instead of drawing its own.

## The uncomfortable part first

1. **This is bigger than one pull request.** The web app has 14 signed-in screens. The
   phone redrew Home, Trip, Money and their sub-screens from fresh mocks that Patrik approved
   between 27 Sep and 10 Oct, and most of those decisions never reached the web. Matching
   all of it is six rounds, roughly three weeks of work, not an afternoon.
2. **Patrik's plan to 30 November says "nothing else before 31 October"** and a feature
   freeze on 31 October (`docs/PLAN-OCT-NOV-2026.md`). The look (rounds 1 and 2) changes
   nothing a stranger can get stuck on and can go now. Rounds 3 to 5 change how editing
   works and belong after the freeze, unless Patrik moves them up.
3. **The web app has no kit.** Every screen writes its own card, button and header. The
   phone has one vocabulary (Card, Notice, PrimaryButton, IconButton, Chip, CardLabel,
   Avatar, TravelLoader). Round 1 starts the web kit; every later round uses it. Without
   that, "the same look" is re-done by hand on every screen and drifts again.

## What is the same already

- The colours, the two fonts (Lora for headings, Work Sans for the rest, tabular figures)
  and the 22 px corner radius come from one file, `design/tokens.json`, and are generated
  into both apps. Nothing to do.
- Four tabs, Home / Trip / Money / Map, with Check in in the middle.
- Bottom sheets with a grabber and no ✕, closed by the scrim, Escape or a drag.
- Home's phases (before, on the road, arrival day, between stops, after) and most of its
  wording (#118).
- Money's numbers, except the three in #127.

## Screen by screen: the phone, then the web today

### The frame of every screen

| | iPhone | Web today |
|---|---|---|
| Tab bar | A floating frosted capsule, 16 px from the sides, at most 520 wide, 64 tall, 1 px line, soft shadow. Labels 11 px. One green highlight slides to the tab you pick. Hidden until you have a journey. | A full-width white bar with a line on top. Labels 12 px. Always shown. |
| Check in | A 56 px green circle with the pin, raised above the capsule, always there once you have a journey. | A 58 px circle, only during the live trip and only for editors. |
| Page padding | 16 px sides, 12 px between cards, 80 px kept free at the bottom. | 18 px sides, 12 px between cards, 76 px at the bottom. |
| Headers | Drawn by each root screen, no system bar. Pushed pages (All entries, Subscriptions, Reminders, Trip settings) use the system bar with a back button and "+" on the right. | Drawn by each screen too, each slightly differently (title 28 / 25 / 20 px). |
| Loading | A small dot travelling along a dashed line ("TravelLoader"), and "Getting your journey". After 4 s: "Slow connection — still getting through…". | A spinner and "Loading…", or plain text. |
| Toasts | A dark pill 96 px above the bottom, 2.4 s. | The same pill, 88 px above the bottom, 2.2 s. |

### Home

| | iPhone | Web today |
|---|---|---|
| Header | Date in small capitals (12.5 px, mauve), the journey's name (28 px serif), one line under it (15 px), the avatar (42 px). | The same, but the date line is 16 px. |
| On the road | One stop card: "ON PLAN" and "Night 3 of 5", the city (30 px), the stay line, the progress bar, "2 nights left" on the right, and a money line inside the card ("Spent here 24 600 Ft · 8 200 Ft a day ›"). The card opens the stop on Trip. Then Arrived (arrival day), the offline pill, "Coming up" (2 rows at most), then the people you follow. | The stop card, then an off-plan card, a big green "Check in" button, Arrived, "Coming up", a Money row, Activity (follower pills, meet-ups, the feed with "Only mine"). |
| Before | The first-stop card: "FIRST STOP", the city (32 px), "Thailand · from 3 Nov", the countdown (44 px mauve) beside "days to departure". No buttons: the card opens Trip. Then "Before you fly" (5 rows), then the estimate card. | The first-stop card with two buttons ("Open itinerary", "Edit"), two tiles (Departure, Trip length), "Before you fly", the estimate, "Explore city costs". |
| After | "Home again"; a recap card with a soft green and mauve wash inside it, the figures in a grid; "+ Plan the next journey"; two link cards (Final numbers, Look back). | The whole page on the landscape wash; a recap card; "Final numbers"; "All check-ins". |
| Reminders | "Coming up" / "Before you fly" cards with tick circles; when nothing is due, one slim row ("Reminders · next 14 Oct · iCloud 2 TB"). | The same idea; the slim row says "Nothing coming up · All reminders". |
| People | "JOURNEYS YOU FOLLOW": a card per journey (avatars, "LIVE" badge, name 22 px, where and next, the latest event, "Open the journey ›"), then "LATEST" with up to 8 feed items. | Follower pills, a meet-ups card, "ACTIVITY · N", the feed with an "Only mine" toggle and "See all". |
| No journey | A "Where to?" card on the wash; or, following someone, their journeys and "Plan a journey". | "Got a follow link?", "Going somewhere yourself?", the feed. |

Left out on the phone on purpose (Patrik, 2 Oct): the big Check in button (the bar has
it), the money card (the stop card's line instead), the off-route card (#134), "Next" (the
stop card opens Trip).

### Trip

| | iPhone | Web today |
|---|---|---|
| Top | The globe fills the top 40 % of the screen; the timeline scrolls up over it. A tap opens the globe full screen (World/Journey and Replay buttons, a card at the bottom). Once the timeline covers the globe, a slim bar with the trip's name and a Globe button. | No globe on Trip (it is on Map). A kicker, the name (25 px), the gear. |
| Header | Kicker 13 px mauve ("DAY 12 · DA LAT, NIGHT 3"), name 28 px, the gear (44 px circle). | Kicker 12 px, name 25 px, the gear. |
| Stop card | City 21 px, country, dates; "4" over "NIGHTS" on the right; the stays. No tick box. Dimmed when out of the plan. Cards at the screen's edges sit slightly smaller and settle as they scroll in. | A 24 px tick box (in or out of the plan), city 18 px, dates, nights 19 px, the stays, "+ Add stay". |
| Opening a stop | A stop **page**: a hero (340 px, the light wash, the city at 44 px), then "STAYS", "GETTING HERE", "LEAVING FOR HUE", "NOTES". "Edit" in the corner. Zooms open from the card. | A stop **sheet** with the form in it: dates, comfort, stays, note, Save, Delete. |
| Editing | Look first, then edit (Apple Calendar's model): every form is a sheet with Cancel and Save; a long press on a card gives Edit stop / Add stay / Add transport / Leave out of the plan / Delete. | Tap a card or row to open its form; Save in the sheet. Ticking the box saves at once. |
| The ends | "Home · Budapest" at the start. At the end "Onward" and "Journey ends · 30 Apr" while the last stop leaves before the end date; "Going home" and "Home · 30 Apr" once a stop reaches it. | "Home · not planned yet" / "Home again". |
| Add stop | A dashed "+ Add stop" row before the way-home leg. | A "+ Add stop" row. |
| After the journey | A "Where next?" card on the wash with three figures, "+ Plan the next journey", a "Look back" card. | Nothing special. |
| No stops | "No stops yet", "+ Add the first stop", "+ Or start with the flight there" (From/To, then the stop form with the place filled in). | "No stops yet." |

### Money

| | iPhone | Web today |
|---|---|---|
| Header | "Money" (30 px), "Asia · day 12 · da lat, night 3" (13 px), a 42 px frosted "+" circle. | "Money" (25 px), a 14 px line, a 46 px mauve "+" circle. |
| Top card | Two tabs, the stop and Journey. Journey: "LANDS NEAR" with the big figure (34 px mauve) and the budget **ring** on the right (spent solid, the rest pale, "72 % of budget" in the middle; an amber outer lap when over); legend rows (Spent so far ›, Still to pay, Day to day, Stays not booked yet, After the plan, Subscriptions, Budget, Left in the budget). The stop tab: the spent figure, two tiles, a bar with one segment a night. Before departure: "ESTIMATED TOTAL" with the same ring. | One card: "SPENT SO FAR · N DAYS", the figure (32 px), "+ X scheduled", Per day and Projected total, the budget bar, "beyond the everyday". |
| Cards | Upcoming charges (new), Latest, Daily spend, Where it goes, Plan, Bookings (always open), Subscriptions (3 rows and "All subscriptions ›" to its own page). Card titles 11.5 px small capitals, mauve. No Track switch, no Budget cap row, no All entries row (All entries opens from Latest). | Overview, the Track switch row, the Subscriptions offer, Latest, Daily spend, Where it goes, Plan, Bookings (folded), Subscriptions (folded), All entries row, Budget cap row. |
| Numbers | "Lands near" covers the whole journey; "+ X not paid yet"; a flight is dated by its charge date. | The old numbers (#127). |
| All entries | A system bar with pull-down search; a chip row (Before departure, Category ▾, All, Everyday, Beyond the everyday, Bookings, Subscriptions, Income); a dashed "Coming up" box; day sections with the day's total; swipe to Delete or Log again. | "‹ Money", the title, a search field, one long card with a "Scheduled" block, month and day headers, "Load more". |
| Subscriptions | Its own page: active rows (a bell to toggle the reminder, "in 3 days" in amber), totals, a CANCELLED card, "+" to add. | A folded card on Money. |
| Entry form | The amount big (46 px) and centred with a currency chip beside it, "≈ 4 200 Ft · you're in Thailand", the four most-used categories as colour tiles and "All 18 categories", the date and an "In the daily average" switch. Cancel / Add in the bar. | The amount (24 px) and currency side by side, 6 category chips and "All N…", the date pill and the "Exclude" switch, "Add expense" at the bottom. |

### Trip settings and Account

| | iPhone | Web today |
|---|---|---|
| Trip settings | A grouped list: "This journey" (name, starts, ends, home) and "Money" (budget, currency locked, "Exchange rates ›" to its own page with swipe to delete and "+ Add a currency"). Each field saves when you leave it; no Save button. Reached from Trip's gear, Money's ring and Account. | `/settings`: a back button, the title, a role badge; one card (name, travellers, start, cap, currency); the FX panel; "Save changes"; Alerts; People on this trip (invites); Danger zone. |
| Account | A grouped list: Signed in as, Sign-in methods; "This journey" → Trip settings; "You": Track spending, Appearance, Design gallery; Sign out. ("The bigger settings overhaul is still to come.") | One long page: Signed in as + Sign out, password, name, home, Your trips, People, Alerts, Appearance, Follow links, delete account. |

The phone has not built invites, follow links, alerts, the password, your name or home yet.
Those stay on the web's Account and Trip settings until the phone has a home for them.

### Map and the globe

The phone's Map tab is a placeholder (kept on 10 Oct only so the bar is not lopsided).
The globe lives on Trip there. On the web the Map tab is the real globe, with search →
Explore. Moving the globe onto Trip (round 3b) leaves the web's Map tab with nothing in
it: Patrik's call (question 2 below).

### What the phone does that a web page cannot

- Haptics (a tap on every landing, selection, success). No web equivalent on iOS Safari;
  skipped.
- Liquid Glass. It is Apple's own material and stays on the phone (Petra, 12 Oct). The web
  uses solid surfaces wherever the phone uses a material (Money's +, the "Open the globe" pill,
  the compact bar over the globe). The phone's floating tab bar is not copied at all: without
  the glass it merged with the cards under it, so the web keeps its own full-width bar.
- Zoom transitions (a card grows into its page). The web's View Transitions API can do a
  cross-fade and, in newer browsers, the zoom. Round 6.
- Pull to refresh, swipe actions on rows, a long press menu, the system date picker and
  number pad. Each needs a web stand-in; the rounds say which.

## The rounds

Each round is one pull request, merged with Petra or Patrik the usual way (say what
changes and what could go wrong, "go", merge, watch the build, test on the phone, record).

1. **The frame** (this pull request). The tab bar keeps its look and takes the phone's rules:
   a tab stays lit on the pages it opens, there is no bar until you have a journey, and Check
   in is on the bar whenever there is one (decision 1). The
   three root headers at the phone's sizes (Home's date line 12.5 px,
   Trip's name 28 px, Money's name 30 px with the 42 px "+"). The start of the kit:
   `product/src/components/ui/`. 16 px side padding on every screen. Nothing changes in what
   you can do.
2. **Home.** The stop card with the money line and no buttons; Arrived; the first-stop
   card with the countdown as on the phone; the estimate card; "Coming up" at 2 rows; the
   recap card with the wash inside it and the two link cards; the people you follow as
   "JOURNEYS YOU FOLLOW" + "LATEST". The TravelLoader instead of the spinner. Drops the big
   Check in button, the Money row, the tiles and "Explore city costs" (decision 3).
3. **Trip.** 3a: the stop card's look (city 21 px, NIGHTS, no tick box, the dimming), the
   dashed "+ Add stop", "Onward" / "Journey ends", the finished-journey card, the no-stops
   card with "Or start with the flight there". 3b: the globe on top of Trip with the
   timeline over it (the web's `Globe.tsx` already draws arcs and the replay); the Map page
   stays, empty, as on the phone (decision 2). 3c: the stop page with its hero and
   sections, "Edit" in the corner, Cancel and Save on every form, the long press menu
   (decision 4).
4. **Money.** 4a: the page as on the phone (the top card with the two tabs and the ring,
   Upcoming charges, Bookings open, Subscriptions as Latest, the rows gone), and the #127
   numbers. 4b: All entries with the chip row, the day sections and the actions; the
   Subscriptions page. 4c: the entry form with the big amount and the tiles.
5. **Trip settings and Account** in the phone's groups ("This journey", "Money", "You"),
   Exchange rates on its own page; invites, follow links and alerts stay where they are.
   Each field saves as you leave it, no Save button (decision 5).
6. **Motion.** The zoom from a card to its page (View Transitions), cards settling as they
   scroll in, figures that roll to their new value, pull to refresh.

## Decided by Patrik, 12 Oct (with Petra, on her Mac)

The six questions this file first ended with, and the answers.

1. **Check in on the bar:** as on the phone, there whenever you have a journey, not only
   during the live trip. Editors only, as before. Built into round 1.
2. **The Map tab on the web** once the globe moves onto Trip (3b): the globe moves, and the
   Map page stays, empty, as the phone's placeholder does. Round 3b.
3. **Home** drops the big Check in button, the Money row, the two tiles and "Explore city
   costs", as the phone did. Round 2.
4. **Trip editing on the web** follows the phone: look first, then edit; a stop page with
   Edit in the corner; every form with Cancel and Save. Round 3c. Closes the question open
   since 27 Sep.
5. **Trip settings** follow the phone: each field saves as you leave it, no Save button.
   Round 5.
6. **Timing:** rounds 1 and 2 before 31 Oct, the rest after the freeze. Patrik: no new
   features, but making the app clear and easy to use is the goal. Changed on 14 Oct
   (Patrik, through Petra): rounds 3–6 go now, in order.

## Record

- 14 Oct: round 4a live (#201, with #200's stop page in place), Money as the phone's MoneyScreen:
  the top card with the stop / Journey switch and the budget ring, Upcoming charges, Latest
  with the category tiles, Bookings open, Subscriptions as Latest's pattern, the All entries
  and Budget cap rows gone, the #127 numbers. The Track spending switch moved to Trip settings
  (Petra), the quiet page invites as the phone's.
  Pictures in `docs/web-ios-redesign/round4a-*`.
- 14 Oct: round 3c live (#199, Petra's test on the phone). Her finding: the stop page slow to
  open and to leave; it was a route, each way a trip to the server. It is a layer over the
  timeline now, at `/itinerary?stop=<id>`, opened and closed without the server.
- 14 Oct: round 3c built, the stop page as the phone's StopPage (the wash hero, the sections,
  "Edit" in the corner), Cancel and Save in the bar of every form with "Discard changes?", the
  long-press menu on a stop card (decision 4). The stop form lost its Stays list, as on the
  phone. Pictures in `docs/web-ios-redesign/round3c-*`.
- 14 Oct: round 3b live (#193, Petra's test on the phone), the globe on top of Trip as the phone's GlobeScaffold (the header over
  the globe, the timeline as a sheet, the open globe with World/Journey and Replay, the card at
  the bottom, the compact bar), with a new lean route globe (`TripGlobe.tsx`) in the phone's
  look (Petra, 14 Oct: the first cut had the Map page's satellite picture); the Map tab empty,
  the planner globe kept for development. Pictures in `docs/web-ios-redesign/round3b-*`.
- 14 Oct: round 3a live (#192, Petra's test on the phone), Trip's timeline as on the phone (the stop card, the dashed
  "+ Add stop", "Onward" / "Journey ends", the "Where next?" card, the no-stops card with
  "Or start with the flight there"); the "In the plan" switch moved from the card into the
  stop's form, as on the phone. Kept until 3c: the money state on the card's stay rows.
  Pictures in `docs/web-ios-redesign/round3a-*`.
- 14 Oct, Patrik (through Petra): rounds 3–6 go now, not after the freeze. Trip, Money and
  the settings were still in the web's old look; the wait had only been the timing.
- 12 Oct, Petra: no glass on the web. Liquid Glass is Apple's material; Money's + is a solid
  surface, and so is everything the later rounds draw where the phone uses a material.
- 12 Oct, Petra: the web keeps its own tab bar. The phone's floating capsule was tried solid
  and merged with the cards under it; the full-width band keeps the page and the bar apart.
- 12 Oct: round 2b live (#188). Kept beyond the phone, for Patrik to keep or drop: your own
  rows in Latest with Edit and Delete, the React and Comment chips, the meet-up lines, photo
  thumbnails. Petra the same day: keep the own rows and name the co-traveller (migration 47,
  `trip_travellers`), and a "Following someone?" line under "Where to?".
- 12 Oct, Petra's answers to the open questions of round 2 (Patrik can overrule): own
  check-ins stay in Latest until the phone's feed page is live; the React and Comment chips
  and the meet-up lines stay until the phone has built theirs; the off-route card is gone for
  good; the phone gets the "Following someone?" line if its follow link works as the web's;
  photo thumbnails in Latest and the people section on a traveller's Home stay as they are,
  because the phone's Home is not finished and there is no example to follow yet.
- 12 Oct, Petra's correction on the phone's plan: your own check-ins will not sit under their
  stops on the phone's Trip; the Map page may become a feed page for them. Round 3b's "Map page
  left empty" is therefore open again, and the web's own rows on Home stay until the web has
  that place.
- 12 Oct: round 2a built, Home's journey part, pull request #187 (pictures of every phase in
  `docs/web-ios-redesign/round2a-*`). Round 2b, the people part, next.
- 12 Oct, Patrik: the six answers above. Check in on the bar whenever there is a journey
  went into round 1 the same day.
- 12 Oct: this file and round 1, by Petra with Claude. Before-and-after pictures of round 1
  at phone width are in `docs/web-ios-redesign/` (`main` on the left, light and dark).
