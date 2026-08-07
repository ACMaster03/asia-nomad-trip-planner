# RIG-PARITY — LIVHOLD v1 build vs handoff rig

Audit of `product/src` (branch `livhold-v1`) against `design/handoff-v1` (Interactive Phone = behavioral truth, All Screens = visual truth, README = global rules). Build history: foundation/nav/auth (`66738e6`–`a158ac2`), onboarding (`871c847`), Home phases (`784d0fb`), Trip+Money (`7156851`), Map/Explore (`b21c4bf`), check-ins/feed (`2089cf5`), followers/system states (`02304e2`), reminders (`9fb0f10`), settings/account/danger (`da0bfa5`), invites (`2b2d8e1`–`f603563`). This file is the post-v1 polish backlog — triage, not fixes.

Severity: **high** = user-visible behavior/affordance gap · **med** = vocabulary breach the eye catches · **low** = polish.

## 1 · Animation vocabulary

Implemented globally (`globals.css`): `lv-enter` (fade+rise .3s, correct curve), `lv-brand`/`lv-reveal` (login arrival, correct 1.4s/1.75s stagger), `lv-grow` (bars from zero .7s), `lv-shimmer` (callback beat), reduced-motion guard. Missing from the kit entirely: sheet slide-up (`dcSheet` 102%→0), toast rise (`dcRise`), option-pick pulse (`lvPick` 1.045× .28s), star pop (`dcPop` .6→1.15→1), recap parallax (`lvPar` 1.1s).

| Screen | Delta | Severity | Suggested fix |
|---|---|---|---|
| Sheets (check-in `live/Sheet.tsx`, `AddReminderSheet`) | Open with `lv-enter` fade+rise 10px, not the rig's slide-up from below (`dcSheet`: translateY(102%)→0 .3s) | med | Add `lv-sheet` keyframes to globals.css; use on Sheet's panel div |
| Trip/Money/Live forms (`trips/Modal.tsx`) | Centered drop-in card, rig vocabulary is bottom sheets for editors (13/14b) | med | Migrate Modal to the Sheet component (or restyle as bottom-anchored) |
| Option cards/pills (P1–P6, tiers, currency, check-in chips) | No 1.045× pulse on pick (`lvPick` .28s); only border/color transition + a 2px translate-x | med | Add `lv-pick` class, apply on selection via key remount or animation retrigger |
| Check-in rating stars | Persistent `scale-[1.12]` on selected stars, not the rig's pop (scale .6→1.15→1) | low | `dcPop`-style keyframe on the just-tapped star |
| P7 recap + post-trip Home | Wash is static; rig drifts background-position 26px over 1.1s (`lvPar`) | low | Add `lv-par` keyframes, apply to the wash container |
| Home pre-trip Estimated-total bar | `transition-[width] duration-700`, not grow-from-zero on landing; live hero/trip-strip bars have no animation at all | low | Use `lv-grow` (Monthly/Budget/Ledger already do, with stagger — correct pattern) |
| Screen enter | No route-level transition (`template.tsx`); `lv-enter` sits on individual cards/mains — some screens (Dashboard main, Trip tab wraps) only animate their first card | low | Add an `(app)` `template.tsx` with `lv-enter`, drop per-card duplicates |
| P-flow progress bar | ✓ tweens `.45s cubic-bezier(.2,.8,.2,1)` — matches | — | — |
| Capsule/tick fills | ✓ `duration-[180ms]` everywhere — matches | — | — |

## 2 · 44px hit targets

Bottom nav ✓ (52px rows, 58px check-in), Trip gear ✓ 44px, Map search ✓ 44px. Under-size list:

| Screen | Delta | Severity | Suggested fix |
|---|---|---|---|
| Home offline banner | Dismiss X is a bare `size-4` (16px) button, no padding | high | `p-3 -m-3` or min 44px square |
| Check-in photo thumbs | Remove badge 22px, floating | med | Enlarge invisible hit area (`before:` inset or padding) |
| Reminders tick circles | 26px (rig-spec size) with **no** compensating padding; rows aren't tappable, so the circle is the only target | med | Keep 26px visual, wrap in ≥44px padded button |
| Stays/Stops/Transport/Extras include-ticks | 24px (`h-6 w-6`), sit inside a card that opens the editor on tap — mis-tap edits instead of toggles | med | Same padded-wrapper trick; generous stopPropagation zone |
| Trip/Money capsule segments | `min-h-[38px]` | low | `min-h-[44px]` inside same 46px capsule (pad vertically) |
| Feed Edit/Delete, "All check-ins ›", P-flow "Skip" | Bare text buttons ~20px tall | med | `py-3 -my-3` padding |
| Star rating buttons | ~30×38px | low | `p-2` |
| Check-in share toggle | 18px checkbox in a text-height row | low | Pad the row button to 44px |
| ＋ Reminder / ＋ Add pills | ~36–38px tall | low | Bump padding |

## 3 · Dark theme

`data-theme` flow is correct: inline `beforeInteractive` resolver in `layout.tsx` (lv-theme/lv-larger localStorage, system fallback) → tokens flip; P6 tile pick applies instantly via `applyTheme`. Hardcoded-color survey found almost everything is the deliberate cases (frosted chips over the photographic wash in login/invite/wizard, P6 theme-preview tiles, the always-dark globe chrome).

| Screen | Delta | Severity | Suggested fix |
|---|---|---|---|
| Map bottom city card (`MapClient`) | `bg-sf` — flips white in light theme over the always-dark globe (known) | med | Hardcode the dark-chrome tokens like the search button beside it |
| DangerZone confirm CTAs | `bg-ac2 text-white` — in dark theme ac2 is #D08795 (light pink), white-on-pink fails contrast; token would be `text-on`… which is dark ink in dark mode, also wrong on pink. Needs a fixed ink | med | Use `text-[#fff]` in light + `text-[#10160f]` dark via `dark:` variant, or a dedicated `--onAc2` token |
| Settings | No Appearance section at all (see §6) — dark theme not reachable from Settings | high | see §6 |
| Everything else | Token-clean; `@custom-variant dark` + wash night variants wired | — | — |

## 4 · Copy drift (~20 strings checked verbatim against frames/rig)

Matches ✓: login helper + Terms line, "Sign in, traveller", tagline, "This is the only hard commit", "5 stops have no stay yet - …city averages, not your numbers.", "Where are you? · Bangkok", "Check in - where are you?", "Offline · syncs later", "Home again"/"· complete", "Nothing is archived - …", "The feed keeps the memories", "Explore needs a connection" + body, "Nothing matches “{q}”", "Go to Today →", map card "Stop N · N nights · wifi …" + "Details", "Post check-in", "Opening your trip…", "Sign-in link invalid or expired", "Sent · again in N s", "Push is off at the system level" + body, "Redo the setup", all P-step titles/blurbs, "Ticking one removes it from Home…".

| Screen | Delta | Severity | Suggested fix |
|---|---|---|---|
| Money · Monthly hero | App: "Earn target / month" + "rent + daily living, before flights"; rig: "Earn target · per month" + "≈ $1 780 · rent and daily living, between the two of you" — divider glyph, missing ≈USD secondary, tone drift | low | Restore middot + secondary approx line |
| Check-in custom add | App: `＋ Add "…" · custom place`; rig: `… · custom place (GPS)` — consistent with no-GPS v1, revisit with GPS | low | Leave until GPS ships |
| Explore offline CTA | "Go to Today →" links `/live` — frame-faithful, but nav 1g has no "Today" destination; reads stale next to the Home/Trip/Money/Map bar | low | "Back to Home →" (or keep; decide once /live merges into check-in sheet) |
| Login button idle-after-send | Frame 02 shows a "Resend link" screen; app stays on login with "Send again" — rig behavior wins per README, fine | — | — |
| P5b "Enable in phone Settings →" | Copy present but rendered as a plain `<p>` — not a link/button (rig has an actionable shortcut) | med | Make it a button (best-effort deep link / instructions sheet) |

## 5 · Toast system

**There is no shared toast mechanism.** The rig's `flash()` fires ~25 distinct dark-pill bottom toasts (2200ms, `dcRise` .28s, bg=tx/ink=pg). The build has exactly two local one-offs: `HomeReminders.ComingUp` ("Ticked - gone from Home, still under Done" — correct look, correct 2200ms, no rise animation) and a comment in `PendingInvites`. Several rig toast moments are replaced by blocking `confirm()` dialogs instead.

| Screen | Delta | Severity | Suggested fix |
|---|---|---|---|
| Global | No `<Toaster>`/`useToast`; each screen would have to hand-roll | high | Extract ComingUp's pill into a shared provider (context + portal, dark pill, 2.2s, lv-rise) |
| Stays/Stops/Transport/Extras delete | `confirm()` dialog; rig = immediate delete + toast with budget consequence ("X deleted · N nights left the plan and the budget") | med | Toast-with-consequence after delete (undo optional) |
| Live feed delete / edit | `confirm()`; rig toasts "Check-in deleted - followers no longer see it" / "Check-in updated - followers see the new version" | med | Same |
| Arrived quick-action | `confirm()`; rig: tap → toast "Arrival recorded - the button is done for this stop" | med | Drop confirm, toast instead |
| Settings sharing | Pause/resume/revoke/create link have no feedback; rig toasts each ("N link paused", "link revoked - that URL stops working", "New follow link created") | med | Toast on mutation success |
| Offline transitions | Rig toasts "Offline - writes queue on the device" / "Back online - 1 queued item synced"; app has banner/chip only | low | Toast on the online↔offline flip |
| Check-in photos | Rig: "Photo added - uploads when there's signal" / "Photo removed…" | low | Toast on add/remove |
| Reminders /reminders page | Ticking has no toast (only the Home slot toasts) | low | Reuse shared toast |
| Sign out | Rig toasts before leaving; app hard-reloads to /login (acceptable) | — | — |

## 6 · State & structure rules

| Screen | Delta | Severity | Suggested fix |
|---|---|---|---|
| Settings | **No Appearance section** (theme Light/Dark/System + Larger text). P7 recap's "Appearance" row links to /settings where nothing exists; README says every personalisation answer lives in Settings | high | Add Appearance card calling the same `applyTheme`/`applyLarger` |
| Trip/Money sub-tab state | ✓ separate per hub, correct defaults (Stops/Budget) — but plain `useState`, so both reset when navigating away and back; rig keeps them per session | low | Lift to module-level or sessionStorage |
| Scroll reset | ✓ Home phase flip resets (`useScrollReset`); route changes reset via Next default. Missing: Trip/Money sub-tab switch and P-flow step advance keep scroll position | med | `window.scrollTo(0,0)` on tab/step change |
| Theme instant-apply | ✓ pick flips whole app pre-paint-safe | — | — |
| Home offline banner dismissal | `offlineDismissed` never resets on a fresh offline episode (known; frame: chip "re-appears on every fresh offline transition" means banner should return per episode) | med | Reset dismissal in the online→offline transition |
| /live offline banner | Persistent, non-dismissible (known; chip collapse is Home-only) | low | Reuse Home's banner→chip pattern |
| Stays | Flat list, no stop-picker sheet (13b), no per-stop grouping (known) | med | Post-v1: group by stop with 13b picker |
| Money · Monthly / by-stop | No expand panels (known) | low | Post-v1 |
| Two-tap delete in forms | Editors (StayForm etc.) have no delete at all; delete is a one-tap link on the card + `confirm()` — rig puts a two-tap delete-confirm inside the editor (14b) | med | Add armed two-tap Delete row to the four forms |
| Reminders | No swipe-to-delete for own reminders (known) — and no delete affordance at all for 'mine' rows | med | At minimum a delete in a row action; swipe post-v1 |
| Check-in | Photo cap 4 vs rig 5; no GPS place guess (both known) | low | Bump `MAX_PHOTOS`; GPS is Phase-7+ |
| Pace slider (P2) | Native `<input type=range>` with accent-color, not the rig's custom 26px-knob slider (known) | low | Custom thumb via CSS (`::-webkit-slider-thumb` 26px, sf bg, ac border) |
| Day counting | `recap.ts`/LiveClient: Day 1 = departure day (FIXTURES.md) → app shows Day 13 where the frame shows Day 12 (known convention question) | low | Owner to rule once; then align `dayNum`/frames |
| Login Terms/Privacy | Rendered as underlined `<span>`s — mauve/underlined per spec but not links | low | Point at real /terms /privacy routes when they exist |
| Nav / phase gates | ✓ check-in button only in live phases, no More tab, gear on Trip, avatar on Home, Explore folded into Map | — | — |

## Top 10 by impact

1. **Ship a shared toast system** (dark pill, bottom, 2.2s, rise-in) and route the ~10 spec'd toast moments through it — biggest single vocabulary gap (§5).
2. **Add Appearance (theme + larger text) to Settings** — P7 recap links to a section that doesn't exist (§6).
3. **Replace `confirm()` dialogs** (deletes, Arrived) with the rig's in-flow patterns + consequence toasts (§5/§6).
4. **Offline banner dismissal must reset per offline episode** on Home; give /live the banner→chip collapse (§6).
5. **Fix the 16px offline-banner dismiss X** and pad the 24–26px tick circles to a 44px effective target (§2).
6. **Sheet/editor animation**: slide sheets up from below; move Trip/Money editors from centered Modal to bottom sheets (§1).
7. **Map bottom city card**: pin to dark chrome so light theme doesn't paint a white card on the dark globe (§3).
8. **Two-tap delete inside the four editors** (Stay/Transport/Extra/Segment forms), per frame 14b (§6).
9. **Option-pick pulse (`lvPick` 1.045×)** across P-flow cards, tier/currency pills, check-in chips (§1).
10. **Scroll reset on Trip/Money sub-tab and P-flow step changes**; persist active sub-tab per session (§6).

Also logged, lower priority: recap/post-trip `lvPar` parallax, star-pop keyframe, Monthly hero copy + ≈USD line, DangerZone dark-mode CTA ink, custom 26px pace-slider knob, photo cap 4→5, reminders delete affordance, Day-12/13 convention ruling, real Terms/Privacy links.
