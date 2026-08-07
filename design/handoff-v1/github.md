repo: ACMaster03/asia-nomad-trip-planner
branch: main
path: product, design

## Last sync
date: 2026-08-04T00:00:00Z
commit: (not recorded — read via tree/file APIs, no commit sha resolved)

### Updated in this project
- NOTE: the Map tab is a literal map — a movable Earth (three.js globe, see frame 19) — intentionally NOT built in the Interactive Phone rig; the rig's Map tab just flashes a pointer to the static frame. Explore's search lives inside this map screen (search icon, top-right).
- Nav restructure (option 1g in Menu Options.dc.html, implemented in the rig): More tab retired — Trip settings behind a gear on the Trip header, Account via the Home avatar, Explore folded into Map as its search. Bar is four icon tabs (Home · Trip · Money · Map) + a raised mauve center "Check in" button that appears ONLY during the live trip (arrive/live/off-plan phases) — planning and post-trip show four evenly spread tabs with no center button; adding stops stays on the itinerary's own "+ Add". Dev must drive the button's presence off trip phase.
- Anna's co-editor flow live in the rig (F group: invite accept → 3 personal steps → "You're in, Anna" recap; trip-level rows read "already set for the trip"); frame 03 error now on the 2b wash; consent links + co-editor phrase in mauve; helper text on frosted chip; theme step live with preview tiles + instant dark mode; night wash variants for dark theme.
- Push-permission-denied state designed (P5b): amber system-notice, alerts fall back to email with "by email for now" on ticked cards, Settings shortcut noted. Closes the alerts backlog item.
- Auth/onboarding v1 completed: partner invite-accept frame (07, /invite/[token] — co-editor front door, skips trip setup, keeps personalisation), auth-callback loading frame (08), Terms/Privacy consent line on login (static + rig), resend cooldown (static 02 shows "Resend in 47 s"; rig counts down 60 s live).
- RESOLVED: dashboard-order personalisation — the "What do you open the app for?" step was dropped entirely (no consequence = no question); the flow is 6 steps. If usage data ever shows a money-first segment, revisit as a Settings option ("Open app on…").
- Livhold branding: logo mark (assets/livhold-mark.png + disc/mono variants), tagline "the living journey, held together", login = 2a valley bg, inbox/wizard/recap = 2b wash; login/wizard/recap live in the rig, frames 01–06 restyled (03 error stays paper).
- Personalisation flow copy fixes: pace note no longer clairvoyant, visa ISO codes removed (passport + truthful notes), followers fields conditional on choice + multi-line digest box, alerts options reworded (push vs email axis explicit).
- POST-V1 CANDIDATE: video in check-ins — one short clip (~15–30s) per check-in as a tile in the photo strip with a duration badge; uploads Wi-Fi-only by default, "send now anyway" override on the queued pill. Not in mocks yet; deferred for offline-queue and roaming-data reasons.
- Check-in "Where are you?": type-ahead over a ranked pool (GPS-nearby → recent check-ins → saved/Explore places), GPS guess pinned on top as a one-tap row, 2 recents chips, "add as custom place" from the typed query. Map picker DEFERRED (offline is core; name > pin precision) — slots in later as "choose on map" inside the picker. Frame 23 + rig sheet.
- DECIDED: no "Import booked costs?" card on Actual — booked costs auto-arrive on their charge date, tagged "from booking" (derivation-only). Card removed from frame 18.
- Actual is one continuous ledger: date-desc entries, month dividers with year ("September 26" — matches Monthly's labels), older months load on scroll. In frame 18 and the rig.
- Rig Budget tab gains the "5 stops have no stay yet" provenance warning; intro subtitles stay frames-only.
- Budget category bars colored: Stays hunter · Daily living #6C8CCF · Transport mauve · One-off extras amber (frame 16 + rig).
- Home "P" avatar now opens Account in the rig.
- ICONS LOCKED: Lucide (chosen over Tabler/Phosphor/Material — see "Icon Sets.dc.html"). All emoji in All Screens + Interactive Phone replaced with inline Lucide SVGs (1.05em, currentColor, 2px stroke); country flags stay emoji; typographic glyphs (✓ → › ★) unchanged. Build with lucide-react.
- Emoji→icon map: 🧭 compass · 📍 map-pin · 🛬 plane-landing · 🍜 utensils · 🎉 party-popper · 🔍 search · 📴 wifi-off · 📡 satellite-dish · ⚠ triangle-alert · 👁 eye.

### Updated 2026-07-29
- NAV CHANGE: bottom tab bar replaces AppNav.tsx's top bar + hamburger — Home · Trip · Money · Map · More, Live taking the Map slot once the trip starts. Frame 08 is now the More screen. This needs a real AppNav rewrite when built.
- Dashboard reworked (see "Dashboard Hybrid.dc.html" 1a): estimated total is the headline, committed + per-day become rows, the ⚠ missing-stay warning is attached to the figure it qualifies, city-cost lists collapse to one row into Explore.
- LOCKED: 22px corner radius (cards 22 · controls 20 · sheets 22; pills and avatars unchanged) — tokens.css + COMPONENTS.md record it.
- DM Mono RETIRED — figures are Work Sans with font-variant-numeric: tabular-nums (slashed zero). tokens.css + COMPONENTS.md updated.
- Mauve rule LOCKED: Hunter fills, mauve outlines and marks; mauve eyebrows only open a block on a quiet screen; one mauve figure per card; destructive is FILLED mauve behind a typed confirm; no red in the palette.
- Amber warn token given a real value: #B08341 (never contrast-checked) → #8A6420 light / #D9A85C dark.
- New: "Interactive Phone.dc.html" — one clickable rig, six configurations (A–F), mounted beside each group in All Screens; real transitions, offline simulation, queued writes.
- /account rebuilt from AccountClient + DangerZone: two cards only, and deletion arms only on the real phrase DELETE MY ACCOUNT, then lands on /goodbye.
- Read this turn: account/{page,AccountClient}, trips/DangerZone.

### Updated 2026-07-29 (earlier)

- New: "All Screens.dc.html" — every living route as a phone frame (33 screens, sections A–E), each captioned with the file that owns it.
- New: section F — a 7-step personalisation flow (P1–P9) proposed on top of the existing wizard; closes gap 4 (traveller alerts) and mock 09 #appearance.

### Updated 2026-07-28
- Palette review: Honeydew page + WHITE cards approved; Ash Grey demoted to inputs/dividers.
- Secondary text changed from "Hunter Green at 70-80% opacity" to solid #3F5A3E (contrast).
- Dark-mode primary ink set to #16100F (white on #C46B78 is 3.67:1).
- New: token layer + component library (ui/ + nomad/) under handoff/product/src.
- Field API extended to cover the real forms (date, numeric, currency affix, 2/3-col rows).
- COMPONENTS.md records which existing trips/* files are replaced vs kept.
- LOCKED: white cards, Lora + Work Sans, Hunter-led accent with Dusty Mauve accompanying.
- 16px minimum text size across the kit, the phone mocks and every component (no text-xs/text-sm).
- Dark-mode mauve lightened #C46B78 -> #D08795 so mauve text clears AA at the 16px floor.
- Fonts: next/font/google install step (repo had no loader) pinned to Work Sans + Lora (+ DM Mono, retired 2026-07-29).

## Screen map
| Artifact | Built from |
|---|---|
| All Screens.dc.html — A–E, 33 phone frames | app/login, auth/auth-code-error, (app)/{dashboard,itinerary,money,map,knowledge,settings,account,live,loading}, follow/[token], digest/{confirm,unsubscribe}, goodbye, components/{AppNav,trips/*} |
| All Screens.dc.html — F, personalisation P1–P9 | new design · extends OnboardingWizard; SCREENS.md gaps 4 + mock 09 #appearance |
| Interactive Phone.dc.html — clickable rig ×6 | same sources as the frames it mirrors; mounted per group in All Screens |
| Dashboard Hybrid.dc.html — 1a/1b + font specimens | (app)/dashboard/DashboardClient.tsx · lib/trips/budget.ts |
| Mauve Options.dc.html — turns 1–3 | palette decision only; no new repo source |
| Palette Test.dc.html — 9 phone screens | design/mocks/01,02,03,04,05,06,07,08,13 + design/mocks/FIXTURES.md |
| Nomad UI Kit.dc.html — primitives gallery | product/src/components/trips/*, product/src/components/AppNav.tsx, product/src/app/globals.css |
| handoff/product/src/app/tokens.css | product/src/app/globals.css (Tailwind 4 @theme inline) |
| handoff/product/src/components/ui/Modal.tsx, Sheet.tsx, useDismissable.ts | product/src/components/trips/Modal.tsx |
| handoff/product/src/components/ui/Stat.tsx | product/src/components/trips/Stat.tsx |
| handoff/product/src/components/ui/Tabs.tsx | product/src/components/trips/Tabs.tsx |
| handoff/product/src/components/ui/TabBar.tsx | product/src/components/AppNav.tsx |
| handoff/product/src/components/ui/Banner.tsx | product/src/components/trips/{ViewerNotice,SaveError}.tsx |
| handoff/product/src/components/nomad/BudgetMeter.tsx | product/src/components/trips/BudgetTab.tsx |
| handoff/product/src/components/ui/Field.tsx | product/src/components/trips/StayForm.tsx |
| handoff/product/src/components/ui/EmptyState.tsx | product/src/components/trips/CreateTripEmptyState.tsx (kept — container) |
| handoff/design/COMPONENTS.md | design/SCREENS.md, docs/PHONE-TESTPLAN.md, product/src/components/trips/{NoAccess,ViewerNotice,SaveError}.tsx |
