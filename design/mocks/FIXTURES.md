# FIXTURES.md — canonical sample data for the mock kit

Every number, date, name and comment shown in mocks 01–10 MUST come from this sheet.
If a mock needs a value that isn't here, add it here first, then use it. This sheet is law;
divergence between mocks is a bug.

## Trip

- Trip name: **Asia 2026–27** · travellers: **Patrik (owner) + Anna (co-editor)** · home base Budapest, Hungary.
- Departs **Mon Aug 31, 2026** (BUD → BKK) · ends **Feb 25, 2027** · **179 days** (178 nights).
- **Day 1 = Aug 31** (departure day, Budapest). Therefore: Sep 1 = Day 2 · Sep 5 = Day 6 ·
  Sep 11 = Day 12 · Sep 12 = Day 13 · Sep 18 = Day 19 · Nov 20 = Day 82. (This resolves the
  former open question in 06 — decided, not open.)
- Weekday facts: Aug 31 2026 = Monday · Sep 1 = Tuesday · Sep 5 = Saturday · Sep 6 = Sunday ·
  Sep 12 = Saturday · Nov 15 = Sunday.

## Flight (the one booked transport leg)

- **BUD → BKK, Qatar Airways via DOH.** Departs **Mon Aug 31 · 14:05 CEST** (BUD T2B),
  lands **Tue Sep 1 · 06:05 ICT** (overnight). Duration **11 h 0 m · 1 stop (DOH)**.
- Online check-in opens Aug 30 · 14:05 CEST (24 h before).
- Price: **372,000 HUF** · 2 pax · booked & paid (estimate before booking was **380,000 HUF**).

## Stops (6 in plan) + nights

| # | Stop | Dates | Nights |
|---|------|-------|--------|
| 1 | Bangkok 🇹🇭 | Sep 1 → Oct 1 (checkout Oct 1) | **30** |
| 2 | Chiang Mai 🇹🇭 | Oct 1 → Nov 1 | 31 |
| 3 | Hanoi 🇻🇳 | Nov 1 → Nov 15 | 14 |
| 4 | Hoi An 🇻🇳 | Nov 15 → Dec 1 | **16** |
| 5 | Kuala Lumpur 🇲🇾 | Dec 1 → Jan 1 | 31 |
| 6 | Bali (Canggu) 🇮🇩 | Jan 1 → Feb 1 | 31 |
|   | unassigned gap | Feb 1 → Feb 25 | 24 |

- In-plan stop nights = 153; +24 unassigned = **177 table nights** (the Aug 31 night is in the air).
- Idea, not in plan: Siem Reap 🇰🇭 (~5 n, TBD Dec).
- **Transport legs: 9 total, 1 booked** (the BUD–BKK flight). Modes: ✈5 🚆2 🚌1 ⛴1.
- Bangkok stay: **The Quartz Residence, Sukhumvit** · booked · **฿42,000 for 30 nights ≈ 437,000 HUF**
  (≈ ฿1,400 ≈ 14,600 HUF / night) · free-cancel until **Aug 24** · card charged **Aug 25**.
- Chiang Mai stay (chosen): Nimman Loft Studio · 265,000 HUF · ฿25,500.
- Hanoi stay (idea): Old Quarter Homestay · 120,000 HUF · ~7.5M VND. Hoi An: no stay yet (gap).

## FX canon (recompute EVERY conversion from these)

- **1 THB = 10.4 HUF** · **1 EUR = 395 HUF** · **1,000 VND = 16 HUF**.
- Rounding: ledger-row amounts → nearest 100 Ft; headline amounts → nearest 1,000 HUF.
- Canonical conversions used in the kit: ฿42,000→437,000 · ฿1,400→14,600 · ฿1,900→19,800 ·
  ฿1,200→12,500 · ฿850→8,800 · ฿620→6,400 · ฿500→5,200 · ฿300→3,100 · ฿240→2,500 ·
  €1,300→513,500 · 4,500,000 HUF→≈€11,390.
- 09 FX table shows exactly: EUR 395.00 (auto) · THB 10.40 (auto) · VND per 1,000 = 16.00 (manual override).

## Money canon

- Budget cap **4,500,000 HUF**. Total planned **4,120,000 HUF = 92% of cap** → status is
  **AMBER** (over the 90% warning threshold, under the red over-cap threshold). The amber
  treatment shows on Dashboard (02, planned-cost tile) AND Money (04, hero + tier + monthly)
  — this doubles as the budget-warning endframe. A red over-cap variant exists but is only
  described in a ✎ note in 04, not mocked.
- Booked / committed = **989,000 HUF** = flight 372,000 + Bangkok stay 437,000 + gear bought 180,000.
  Estimated (unbooked) = 3,131,000. Headroom = 380,000.
- Category totals (must sum to 4,120,000): **Stays 1,780,000** (booked 437,000) ·
  **Transport 1,006,000** (booked 372,000) · **Food 705,000** · **Extras 629,000** (committed 180,000).
- Extras 629,000 = 03's itemized in-plan extras exactly: visas 84,000 (TH ext 44k + VN e-visa ×2 18k +
  MY 0 + ID VoA ×2 22k) + insurance 340,000 + gear 205,000 (backpacks 180k bought + adapter/router 25k).
  Wishlist (out of plan): Anna's phone 250,000.
- Per-stop estimates (sum 4,120,000 · actual-so-far sums 809,000 = flight+stay):
  flight est 380,000/actual 372,000 · Bangkok 780,000 (26,000/n) /actual 437,000 ·
  Chiang Mai 640,000 (20,600/n) · Hanoi 320,000 (22,900/n) · Hoi An 330,000 (20,600/n) ·
  KL 610,000 (19,700/n) · Bali 700,000 (22,600/n) · home leg+buffer 360,000 (15,000/n) · 177 nights.
- Monthly cash-out: Aug 809,000 (booked) · Sep 343,000 · Oct 640,000 · Nov 650,000 · Dec 610,000 ·
  Jan 700,000 · Feb 360,000 → total 4,112,000 (differs from budget's 4,120,000 because the flight
  actual 372k replaces the 380k estimate). Earn targets 450,000 ×6 + 300,000 (Feb) = 3,000,000 →
  planned net burn −1,112,000. 4,112,000 = 91% of cap → also amber.
- September ledger (live, viewed Sep 12): Chatuchak gifts Sep 12 ฿850→8,800 (Extras, Anna) ·
  Grab to Wat Pho Sep 11 ฿240→2,500 (Transport, Patrik) · Jay Fai dinner Sep 10 ฿1,900→19,800
  (Food, Anna) · freelance payout Sep 9 €1,300→+513,500 (Income, Patrik) · 7-Eleven Sep 8
  ฿620→6,400 (Food, Patrik) · SIM ×2 Sep 5 ฿1,200→12,500 (Extras, Patrik) · BTS top-up Sep 2
  ฿500→5,200 (Transport, Anna). Month-to-date: In +513,500 · Out 55,200 · Net +458,300.
  August: flight 372,000 (Aug 31) + apartment 437,000 (Aug 25) → Out 809,000.

## Subscriptions canon (issue #37 — SHIPPED 2026-09-20)

Five recurring costs from home, all in HUF, all billed to the same card. **Anchor day + cadence
is declared, never inferred from the ledger.** Deliberately none of the active ones charges
between Sep 1 and Sep 12, so the September ledger canon above stays untouched.

| Subscription | Amount | Cadence | Anchor | Next (as of Sep 12) | Reminder |
|---|---|---|---|---|---|
| iCloud 2 TB | **3,290** | monthly | 14th | **Mon Sep 14** (in 2 days) | off |
| Spotify Duo | **2,490** | monthly | 17th | Thu Sep 17 | off |
| Home internet · Budapest flat | **7,990** | monthly | 23rd | Wed Sep 23 | **on, T-3** |
| Domain + hosting | **18,000** | yearly | Nov 12 | Thu Nov 12 | **on, T-7** |
| Netflix | 4,490 | monthly | 20th | — **cancelled Sep 6** | — |

- Active monthly run-rate = 3,290 + 2,490 + 7,990 + (18,000 / 12 = 1,500) = **15,270 Ft / month**.
- Netflix: last charge **Aug 20** (pre-departure), cancelled **Sep 6**, so **0 charges on this trip**.
  It stays listed, struck through, behind a "Show cancelled (1)" toggle — cancel is a state, never
  a delete.
- **Counted charge by charge — NOT amortised** (corrected 2026-09-20, when the feature was built).
  From Sep 13 to the Feb 25 end: iCloud ×6 + Spotify ×6 + internet ×6 + the single Nov 12 domain
  renewal = 6×3,290 + 6×2,490 + 6×7,990 + 18,000 = **100,620 Ft**. Across the whole trip the same
  100,620, since nothing charges between Aug 31 and Sep 12 by construction.
  An earlier draft amortised the run-rate over the days instead (15,270 × 166/30.4 ≈ 84,000) and so
  billed 1/12 of the yearly domain fee per month when the whole 18,000 actually leaves the account
  on Nov 12. **Amortising understates the cash by the part of a yearly renewal that falls inside the
  window, and it cannot place a charge in a month** — which the monthly bars have to do. The
  15,270/month run-rate is still the right headline for "what do these cost me"; it is just not the
  right way to total a window.
- **Effect on the projection (live read).** The Money overview quotes `projection.projected`,
  built from the observed pace — not the pre-trip plan. Stops subtotal 3,479,800 + transport
  372,000 + residual 180,000 = **4,031,800**; with subscriptions ahead (100,620) =
  **4,132,420 = 92% of the 4,500,000 cap**. So subscriptions move it **90% → 92%**, two points.
  (The first draft claimed two points by measuring against the planning figure, which was wrong
  reasoning; the second draft corrected it to one point by amortising, which was the wrong total.
  Two points, counted properly, is the answer.)
  The per-day rate is unchanged — subscriptions stay in `NON_DAILY_CATEGORIES`.
- **The overview progress bar measures ACTUAL against the cap**, not spend against a forecast
  (owner decision, 2026-09-19): **1,044,200 / 4,500,000 = 23%**, 3,455,800 left. The pre-trip
  estimate line (`budget.grand`) is gone from the page; `projection.projected` keeps its tile.
- **The planning figure is GONE from the page** (built 2026-09-20). The monthly card was the last
  thing standing on it — 4,112,000 + 100,620 = 4,212,620, differing from the live 4,132,420 because
  Bangkok is coming in under its 780,000 pre-trip estimate — and it now runs on the live projection
  like everything else (`monthlyOutflow`, spending.ts). The figure is kept here only to explain the
  gap; nothing renders it.
- Subscriptions per month, on the dates they actually charge: Sep–Feb **13,770** each
  (3,290 + 2,490 + 7,990), plus **18,000** in Nov for the domain → Nov is **31,770**.
  Sum 100,620. Amortising them evenly (the earlier draft's ~15,000/month) is what the bullet above
  rejects — a bar for November that hides an 18,000 renewal is the kind of smoothing this page
  exists to stop doing.

## Canonical check-ins / events (reuse EVERYWHERE: 02, 06, 07, 08, 10)

Same date/time/author/rating and ONE canonical comment string each:

1. **Arrived in Bangkok** — event, no rating · **Tue Sep 1 · 06:05** (auto-suggested from the
   flight, confirmed by Patrik). 07 also shows "Flight landed — Bangkok (BKK)" at the same 06:05.
2. **Lumpini Park** — Anna · **★3** · **Sun Sep 6 · 07:40** · no photo ·
   "Morning run. Shared the path with two monitor lizards."
3. **Jay Fai** — Anna · **★4** · **Thu Sep 10 · 19:30** · 1 photo (the photo is the one that
   fails to sync in 06's sync-error state) · "Crab omelette worth the two-hour queue."
4. **Wat Pho** — Patrik · **★5** · **Fri Sep 11 · 08:45** · **1 photo** · shared to followers ·
   "Reclining Buddha is unreal. Go before 9am — no crowds."
5. **Chatuchak Weekend Market** — Anna · **★5** · **Sat Sep 12 · 10:15** (Saturday — the market is
   weekend-only) · 2 photos · "Bought two bags of things we absolutely do not have room for."
   This is 06's queued/offline example (offline state is Sat Sep 12).
6. **Jay Fai (2nd visit)** — Patrik · **★4** · **Thu Sep 17 · 20:10** ·
   "Round two. Drunken noodles this time — still worth the queue."

- 02's live state is **viewed Fri Sep 18** → its "Recent check-ins" shows the latest 3:
  Jay Fai #2 · Chatuchak · Wat Pho. Its plan-vs-actual card shows the "no check-in yet today"
  variant (last seen 09:10 near Lumpini Park from a Map ping).
- 10's journal (viewed Day 21) shows public entries: Chatuchak (Day 13) · Wat Pho (Day 12) ·
  Jay Fai (Day 11) · Arrived (Day 2) · Departed Budapest (Day 1).

## Sharing canon

- **Followers = 2 active** (Mom + Anna's dad), both on the "Family" link. "Friends" link: 0 active.
- **Viewers = 1** (Dávid, read-only account). Co-editor = Anna (traveller, not counted as audience).
- 09's summary: "**3** people can currently see your trip" = 2 followers + 1 viewer.
- 07's pause state is named **"Sharing paused"** — reference it by that name.

## Daily-cost semantics canon

- **Daily costs are per person and EXCLUDE stays unless labeled otherwise.**
- 02 region cheat sheet (per person · excl. stays · mid-range): Thailand 11,000 · Vietnam 8,500 ·
  Malaysia 10,000 · Bali 9,500 HUF/day. Bangkok plan = (780,000 − 437,000 stay) / 30 n / 2 people
  ≈ **5,700 HUF/day/person excl. stay** — lean vs the 11,000 benchmark.
- 05 country panel "per person incl. stay" and 08 city tiles "for two · excl. stay" are allowed —
  they are labeled. 08 Bangkok couple daily budget: 1,800–2,600 THB ≈ 19–27k HUF (~23k mid).
- 04 "Daily average" tile = whole plan / nights, labeled all-in: 4,120,000 / 177 ≈ 23,300 HUF/night,
  both travellers, incl. stays.

## HUF format canon

- **"4,500,000 HUF"** — comma-grouped digits + unit "HUF" — everywhere: body copy, stats,
  badges, tables, monthly cards.
- Exception (picked + noted): **"Ft" is allowed only inside ledger row amounts** (04's ledger list
  rows, its add-entry FX hint, and the empty-state import rows) where space is tight.
- Compact "4.12M HUF" style is allowed only inside dense chart labels (04 tier strip marker).

## Explore catalogue counts (08)

- Header = **8 countries · 26 cities · 86 places** (must equal the tile sums:
  TH 34 = BKK 12 + CM 8 + Phuket 6 + Krabi 4 + Pai 3 + Ko Lanta 1 · VN 18 · MY 9 · ID 7 ·
  KH 5 · LA 3 · SG 6 · PH 4 = 86; cities 6+5+3+4+2+2+1+3 = 26).

## Visa canon

- Vietnam e-visa: **apply from Oct 2** (≤ 30 days before the Nov 1 entry) — same copy AND date
  math in 02 (deadline card "Oct 2") and 03 (extras row).
- Thailand: visa-exempt 60 days + 30-day extension (~1,900 THB, Chiang Mai immigration).

## Nav canon

- "Live" IS an appnav item **during the live phase only**: 06 shows it; 02's live state shows it
  (with a ✎ note); planning-phase navs (01–05, 08–10, 02 planning/viewer) never show it.
- No nav links are hidden on phone (06's former phone-hiding of Money/Explore/Settings removed).

## Component reference notes

- Toggle switches: **09-settings' `.switch`** (checkbox-based, 42×23) is the reference
  implementation for the real app. 03's `.sw`, 05's `.tgl` etc. are static visual stand-ins —
  cosmetic variance is acceptable at mock stage.
- Class-name collisions across mock files are fine — every file is standalone.

## Account (mock 13)

- Patrik signs in with **patrik@nomad.example** (magic link — no password exists anywhere).
- The Account page (/account, nav avatar) is app-level: identical and reachable with a live trip,
  zero trips, mid-onboarding, or freshly-revoked access. Trip-scoped settings stay on Trip settings (09).
- Delete-account consequences (confirm state): **1 owned trip (Asia 2026–27) · 34 ledger entries ·
  every photo**; seats on joined trips are freed; owners keep their trips.

## Mocks 15 and 16 canon (2026-09-22 — issues #58, #59, #60, #62, #63)

The two mocks filed from the 2026-09-22 product review (`15-trip-timeline.html`,
`16-money-quiet.html`) are drawn on the **live-shaped fixture**
(`product/src/app/dev/money-preview/fixture.ts`), the same data mock 14 moved to, not on
the six-stop plan above. Viewed **Mon 22 Sep 2026 = day 23, Bangkok night 22**.

- Journey **Asia** · departs Mon 31 Aug 2026 · ends 30 Apr 2027 (242 nights) · home Budapest.
- Stops: **Bangkok** 1 → 30 Sep (29 n) · **Hanoi** 30 Sep → 13 Nov (44 n) · **Da Nang** 13 Nov →
  13 Dec (30 n). 103 of 242 nights placed.
- Legs: Budapest → Bangkok, flight, Mon 31 Aug, **via Shanghai · 14 h 35**, booked,
  **248 000 Ft**, paid · Bangkok → Hanoi, Wed 30 Sep, nothing booked · Hanoi → Da Nang, Fri 13
  Nov, train, idea · Da Nang → Budapest, not planned.
- Stays: Bangkok **Home in Khet Huai Khwang** (Booking.com, 33.71 USD/n, 29 n, paid 9 Jul,
  **305 788 Ft**) · Hanoi **Văn Giang (Mai Kenny)** (Airbnb, 29 USD/n, 44 n, card 29 Sep,
  ≈ 433 800 Ft) · Da Nang **An Bang beach house** (Airbnb, 41 USD/n, 13 → 30 Nov, 17 n,
  shortlist, ≈ 237 000 Ft) → **no bed 30 Nov → 13 Dec, 13 nights**.
- FX for these two mocks: **1 USD = 312.8 Ft** (so 33.71 → 10 545 and 977.59 → 305 788, as in
  mock 14) · **1 THB = 10 Ft**. A 35 USD/night stay ≈ 10 950 Ft/n, ≈ 142 000 Ft for 13 nights.
- Money replay (mock 16): day 1 spent so far **657 200 Ft** (stay 305 788 + flight 248 000 +
  backpack 64 900 + e-SIM ≈ 3 400 + airport food 35 100) · day 4 **730 500** · day 9 **765 400** ·
  everyday 31 Aug – 3 Sep **108 400** (food & drinks 54 800, health & care 23 900, clothes
  14 400, groceries & shops 12 300, getting around 3 000) · per day **24 400** over 3 days, then
  **15 100** over 7 · projected total on day 9 **≈ 3 496 000** (stops ≈ 2 684 000 + transport
  248 000 + one-offs still to pay ≈ 564 000) · cap 4 500 000.
- Subscriptions offer (mock 16 §8): the five from the #37 canon above, all prefilled monthly, the
  domain switched to yearly by hand.
