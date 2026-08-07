# Handoff: Livhold — trip app v1 (auth, onboarding, nav, all screens)

## Overview
Livhold is a two-editor travel planning + memory app (working demo trip: "Asia 2026–27", 6 stops, 179 nights, 2 travellers, HUF home currency). Its differentiator: **more than one person can be a full co-editor of a trip**. This handoff covers the complete v1 design: branding, login/auth, onboarding (trip wizard + personalisation flow), the partner-invite flow, the four-tab app (Home / Trip / Money / Map), reminders, check-ins, settings, account, follower/no-account pages, and all system states.

Source repo association: `ACMaster03/asia-nomad-trip-planner` (branch `main`, see `github.md` in the project root for per-screen file mapping and decision receipts).

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, not production code to copy directly. Your task is to **recreate these designs in the target codebase's existing environment** (the repo is a Next.js app — use its established patterns: `app/` routes, existing components like `DashboardClient.tsx`, `OnboardingWizard`, `AppNav`) using its libraries. Do not ship the HTML.

Two files matter most:
- **`All Screens.dc.html`** — the full screen inventory as static frames (numbered 01–36 plus P1–P7 personalisation frames), organized in sections A–F. Each frame's monospace caption names the repo file it maps to.
- **`Interactive Phone.dc.html`** — a live, clickable rig embedded per section; it is the **behavioral truth** (state transitions, animations, conditional visibility). Where a static frame and the rig disagree, the rig wins.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and interactions are final. Recreate pixel-accurately with the codebase's stack. All copy is final English (the product may later be localized to Hungarian — keep strings externalized).

## Brand
- **Name:** Livhold. **Tagline:** "the living journey, held together" (lowercase, letter-spaced).
- **Logo:** `assets/livhold-mark.png` (transparent bg, full color). Variants: `livhold-mark-mono-paper.png` (one-color paper-white for dark surfaces), `livhold-mark-disc.png` (+ sage/hunter disc variants; the off-white disc is the app-icon treatment).
- **Landscape washes** (the brand's signature): `livhold-login-bg.jpg` (2a "valley morning" — login + invite only), `livhold-login-bg-light.jpg` (2b lighter wash — inbox confirmation, wizard, personalisation recap, auth error, callback loading, post-trip recap). Dark theme uses `livhold-login-bg-dark.png` / `livhold-login-bg-light-dark.png` (night variants).
- **Wash grammar (important):** the landscape appears only when the app *greets* you or *hands you something finished* (doors + milestones). Working screens stay on plain surfaces. 2a appears on exactly one screen (login/invite); never show 2a and 2b adjacent; never add a third variant.

## Design Tokens
Defined as CSS variables in both files (light + dark sets, see the `data-dc-script` block in `All Screens.dc.html`):

Light theme:
- Canvas `#f0eee9` · page bg `--pg #E8F7EE` · surface `--sf #FFFFFF` · input `--in #F7FAF8`
- Text `--tx #1F2A24` · secondary `--tx2 #3F5A3E` · tertiary `--tx3 rgba(31,42,36,.5)`
- Primary (hunter) `--ac #3F5A3E`, on-primary `--on #FFFFFF`
- Accent (mauve) `--ac2 #A94C5A`, deep mauve `--ac2Deep #93404C` (links, wayfinding, memory/people accents)
- Warn amber `--warn #8A6420` (+ warnLine/warnSoft) · tag/honeydew `--tag #E4EEE6`, `--tagInk #2B3A4A`
- Lines `--ln rgba(31,42,36,.11)`, `--ln2 .16`, `--ln3 .24` · track `--tr rgba(31,42,36,.13)`
- Budget category colors: Stays hunter `#3F5A3E` · Daily living `#6C8CCF` · Transport mauve · One-off extras amber
- Palette extras: sage `#C9D4BA`, pale blue `#AEC3D6`, paper `#F5F2EA`, blush `#F7E6E9`

Dark theme: canvas `#12161A`, pg `#161A18`, sf `#1F2622`, tx `#D8E0E5`, ac `#7FA37D` (on `#10160F`), ac2 `#D08795`, ac2Deep `#DE9BA7` — full set in the script block.

- **Corner radius: LOCKED at 22px** (cards 22, controls 20, sheets 22; pills/avatars round).
- **Type:** Lora (serif — headings/display), Work Sans (sans — body/labels/figures, always `font-variant-numeric: tabular-nums` on numbers), system monospace for dev captions. Body 16px min.
- **Icons: LOCKED on Lucide** (build with `lucide-react`), 2px stroke, currentColor. Country flags stay emoji; typographic glyphs (✓ › ★) stay text.
- **Color semantics:** hunter = primary actions AND check-in; mauve = wayfinding/links/people/memories; amber = warnings/money-risk. Legal links: mauve, underlined, weight 500.

## Navigation (final structure — "1g", see Menu Options.dc.html for the decision record)
- **Bottom bar: four icon+label tabs** — Home (house) · Trip (route) · Money (wallet) · Map (map). Active: hunter, 600 weight, 2.2px stroke. Inactive: `--tx3`.
- **Raised center check-in button** (58px hunter circle, white 4px ring, pin icon) **appears ONLY during the live trip** (phases arrive/live/off-plan). Planning + post-trip: four evenly spread tabs, no center button. Drive this off trip phase.
- **No "More" tab.** Trip settings = gear button right of the Trip page's tab capsule. Account = avatar top-right of Home (all phases). Explore was **retired as a destination** — its search lives inside Map (search icon top-right; Map is a literal movable Earth, three.js globe — frame 19).
- **Sub-nav capsules** (Trip: Stops/Stays/Transport/Extras; Money: Budget/Monthly/Actual): white pill container (1px `--ln2` border, 999px radius, 3px padding), centered; active segment filled hunter with white text, 15px labels. Trip's gear sits right of the capsule in the same row. **Trip and Money keep separate active-tab state** (defaults: Stops / Budget).
- Trip settings screen has a back arrow (circle button, arrow-left) returning to Trip.

## Auth & Onboarding flow
1. **Login** (`app/login/page.tsx`, frame 01): full-bleed 2a valley; centered brand stack (64px mark → LIVHOLD → tagline); "Sign in, traveller" (Lora 40px, centered); email field (translucent white `rgba(255,255,255,.82)`); hunter "Send magic link"; helper + Terms/Privacy lines on **frosted chips** (`rgba(255,255,255,.72)`, blur 3px, radius 16px — required for contrast over the valley). Entry animation: brand stack alone at center ~1.4s, drifts up; headline + form fade up after (see `lvBrand`/`lvReveal` keyframes in the rig).
2. **Check your inbox** (frame 02): 2b wash; centered brand stack, mail icon, sent-to line; "Resend link" with **60s cooldown** ("Sent · again in 47 s", disabled style).
3. **Auth error** (frame 03): 2b wash, card: "Sign-in link invalid or expired" → back to sign in.
4. **Signing in** (frame 06c): 2b wash, pulsing mark, "Opening your trip…" (/auth/callback beat, 1–2s).
5. **Trip wizard** (frames 04–06, 3 steps on 2b wash): basics → home base → invite partner. Step 1's note: "This is the only hard commit" (frosted chip).
6. **Partner invite accept** (frame 06b, `/invite/[token]`): 2a valley; "Patrik invited you to plan together"; trip card with mauve **"you join as a full co-editor"**; prefilled email; "Accept & sign in"; helper on frosted chip. **Anna skips trip setup**: her personalisation is 3 steps only (followers, alerts, theme), recap headline "You're in, Anna", trip-level rows read "already set for the trip".
7. **Personalisation flow** (P1–P7, 6 skippable steps, straight after Create trip): who's going (multi name rows appear for "A small group": You/Them/Them/＋ add a name) → pace (nights slider 3–60, default 30 + comfort tier: Frugal 10 000 / Comfortable 17 000 / Generous 28 000 Ft/day for two) → money & paperwork (currency pills HUF/EUR/USD/GBP + "More ⌄", passport full-name pills, "＋ add another") → followers (fields appear only after choosing: Family link + weekly email → link name + multi-line digest-emails box; Link only → name only; Nobody yet → nothing) → alerts (**multi-select**: Deadlines / Charges / Partner activity; none selected = email-only) → theme (Light/Dark/System preview tiles — Dark applies instantly to the whole app; "Larger text" toggle). Step notes use **mauve lead-in words** ("Visa costs| land in…"). Progress: thin hunter bar + "Step X of N". Recap on 2b wash with parallax drift, picks joined with "+", "Redo the setup" blush button (#F7E6E9).
   - **P5b — push permission denied:** amber notice "Push is off at the system level", alerts fall back to email ("by email for now" on ticked cards), shortcut to phone Settings; mirrored in Settings → Alerts.

## Home (one phase-aware tab, frames 07–10)
All variants: header (uppercase mauve date eyebrow, "Asia 2026–27" Lora 28px, position line) + avatar "P" (42px, mauve-soft circle → Account).
- **Pre-trip (07):** Next-stop card (Bangkok, chips, Open itinerary/Edit), departure/length tiles, **Before you fly** (mauve header, reminders list with date blocks, tick circles for user reminders, mauve dots for money rows, "＋ Reminder") ABOVE **Estimated total** card (3 850 330 HUF, 86% of cap bar, committed/per-day rows, amber "5 stops have no stay yet" note). Order is intentional: actionable above informational.
- **Live/Arrival/Plan-drift (08–09):** hero card (city, night N, Day X of 179), **hunter "Check in" button**, plan strip, coming-up reminders, recent activity feed. Off-plan: "Right now" state, drift card (shift plan / add stop / keep plan), amber accents. Offline: dismissible banner first time, then "Offline · syncs later" chip; check-ins queue.
- **Post-trip (10):** full-screen 2b wash + parallax; "Home again"; stats card (check-ins/photos/spent/vs plan); "Final numbers" row → **Money → Actual**; honeydew "Nothing is archived" note; mauve "The feed keeps the memories" header + single "All check-ins · 214 so far" forward card (→ check-ins screen). No center nav button.
- Screen/phase changes must **reset scroll to top**.

## Trip, Money, Map, system screens
- **Trip** (12–15 + 13b, 14b): capsule sub-nav + gear; each tab: Lora 25px title + hunter "+ Add"; card lists with tick-to-include (ticking a leg holds its money in the budget), tap card to edit (14b leg editor with delete-confirm), derived summary notes.
- **Money** (16–18): Budget (colored category bars, provenance warning), Monthly (month cards, animate bars from zero on land), **Actual = one continuous ledger** (date-desc, month dividers "September 26", older months on scroll; booked costs auto-arrive on charge date tagged "from booking" — no import card, derivation-only).
- **Map** (19): three.js movable Earth, dark UI, mauve planned-stop pins, legend, bottom city card; **search icon top-right = the old Explore** (frames 20–22: browse/results/offline — Explore is online-only).
- **Check-ins** (23, 08b–08d): sheet with GPS-first type-ahead ("Where are you?" — GPS guess pinned, 2 recency chips, "＋ Add as custom place"), star rating pop, photos, share toggle; offline → queued pill. Edit keeps place/time fixed ("only your words change"). Video: post-v1 (Wi-Fi-only when it ships).
- **Reminders** (25–26), **Settings** (27, 27b alerts, 28 sharing + pause/revoke links, 28b/c delete trip type-to-confirm), **Account** (29 + Your trips list: active/switch/＋ New trip; 29b/c delete account), **Goodbye** (33), **Follower pages** (30–32: follow view, digest confirm, unsubscribe — no money/private notes/exact GPS), **Loading skeletons** (34, 34b), **No access / revoked** (35–36).

## Interactions & animation vocabulary
- Screen enter: fade+rise `.3s cubic-bezier(.2,.7,.2,1)`; sheets slide up `.3s`; toasts (dark pill, bottom) ~2.2s.
- Option pick: 1.045× pulse `.28s`; ticks fill hunter; sub-tab underlines/capsule fills transition `.18s`.
- Login arrival sequence + recap parallax (`lvPar` 1.1s) as above. Progress bars tween width `.45s`.
- Buttons: 44px min hit targets.

## State Management (key requirements)
- Trip **phase** (pre / arrive / live / off-plan / post) drives: Home variant, center nav button presence, date "today", reminder derivations.
- Onboarding **choices** object (who/names, pace nights+tier, currency+passport, followers+emails, alerts array, theme) → recap; theme applies live.
- Offline flag → banners, queued check-ins, Explore/Map-search gating.
- Feed is editable state (add/edit/delete check-ins, follower notification copy).
- Resend cooldown timer; magic-link session; invite token → co-editor join (skips wizard, short personalisation).

## Assets (in `assets/`)
`livhold-mark.png` (+ mono-paper, disc variants), `livhold-login-bg.jpg` (2a), `livhold-login-bg-light.jpg` (2b), `livhold-login-bg-dark.png`, `livhold-login-bg-light-dark.png` (night variants). World data credits on Map: GeoNames (CC BY 4.0), © OpenStreetMap contributors (ODbL).

## Files in this bundle
- `All Screens.dc.html` — full static screen inventory (open in a browser; Tweaks: darkMode, cornerRadius)
- `Interactive Phone.dc.html` — the live rig (imported by All Screens; behavioral truth)
- `Menu Options.dc.html`, `Trip Tabs Options.dc.html`, `Login Looks.dc.html` — decision records (archived explorations; the banners state what won)
- `Logo Scale Test.dc.html` — logo variants at sizes/on surfaces
- `assets/` — logo + landscape washes
- `github.md` — repo mapping, screen map, decisions, backlog (post-v1: check-in video)
