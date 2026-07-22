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
