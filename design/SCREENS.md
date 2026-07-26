# Screen × State Coverage Matrix (M0 design gate)

Every cell must exist as a state in the corresponding mock before implementation of that
screen begins. Mocks live in `design/mocks/` — self-contained HTML, one file per screen,
state switcher + phone/desktop + dark/light + annotation toggles in the mock bar.

Legend: ☐ mock pending · ☑ mock done · ✅ approved by owner

| # | File | Screen | States (switcher) |
|---|------|--------|-------------------|
| 1 | `01-signin-onboarding.html` | Sign-in & onboarding | ☐ new user sign-in · ☐ returning user · ☐ OTP/magic sent · ☐ onboarding wizard (trip basics) · ☐ co-editor invite accept · ☐ auth error |
| 2 | `02-dashboard.html` | Dashboard | ☐ planning phase (owner) · ☐ live phase (traveller, plan-vs-actual) · ☐ empty (no trip) · ☐ viewer (read-only) |
| 3 | `03-itinerary.html` | Itinerary: Stops/Stays/Transport/Extras | ✅ **city picker (Tier 2, server-searched)** · ✅ **picker offline** · ☐ stops+timeline table+filters (editor) · ☐ stays chrono/decluttered · ☐ stay edit modal (cancel-until, charge date) · ☐ transport collapsed+type filter · ☐ transport expanded row · ☐ extras · ☐ viewer read-only |
| 4 | `04-money.html` | Money: Budget/Monthly/Ledger | ☐ budget view 1 (bars+strip) · ☐ budget view 2 (by stop) · ☐ monthly (optional, simplified) · ☐ ledger + auto-imported plan costs · ☐ ledger add entry · ☐ empty ledger · ☑ budget-cap warning (amber ≥90% — shown in the budget views; red over-cap variant described in a ✎ note) |
| 5 | `05-map.html` | Map | ☐ planning view (globe, arcs, hazards) · ☐ live view (position ring, last-seen) · ☐ country panel · ☐ settings overlay (timezone, layers) · ☐ lite/2D fallback |
| 6 | `06-live.html` | /live today screen (phone-first) | ☐ today overview · ☐ check-in flow (place pick→rate→comment→photo) · ☐ custom place add (GPS) · ☐ offline (queued badge) · ☐ sync error/retry · ☐ plan-vs-actual timeline · ☐ pre-trip state (not started) |
| 7 | `07-follow.html` | /follow/[token] (no account) | ☐ follower view (globe last-seen + feed + photos) · ☑ pre-trip (countdown + coarse route, before Aug 31) · ☐ notify-me opt-in · ☐ quiet period (no events days) · ☐ revoked/expired link · ☐ sharing paused |
| 8 | `08-explore.html` | Explore / knowledge base | ✅ **searching (Tier 2 server RPC)** · ✅ **no results** · ✅ **offline / online-required** · ✅ start-empty + country filter · ✅ country selected (list) · ✅ city detail (lazy-loaded) · ☐ admin state (add city/field, edit values) |
| 9 | `09-settings.html` | Settings | ☐ trip meta + FX · ☐ sharing panel (links create/revoke, follower count, co-editors) · ☐ theme & accent/destination palettes · ☐ danger zone (delete/leave trip) |
| 10 | `10-later-phases.html` | Later-phase endframes | ☐ public place page /p/[country]/[place] · ☐ public trip journal · ☐ Expo app 4 tabs (Today/Map/Feed/Money) · ☐ moderation queue (admin) |
| 11 | `11-digest-links.html` | Digest links: /digest/confirm, /digest/unsubscribe, the emails | ✅ confirmed · ✅ already confirmed · ✅ expired/invalid link · ✅ unsubscribed · ✅ undo taken · ✅ one-click (RFC 8058) · ✅ server error · ✅ the two plain-text emails |
| 12 | `12-fx-rates.html` | FX rates panel in Settings (M4) — **supersedes the FX half of row 9**: rates are no longer owner-editable | ✅ fresh · ✅ refreshing · ✅ stale >48h · ✅ fetch failed · ✅ manage currency list (+accepted-in) · ✅ auto-added from itinerary · ✅ new-country banner · ✅ offline |

Global requirements for every mock:
- Desktop AND phone viewport must both look intentional (container queries; check both).
- Dark AND light theme must both work (design tokens only, no hardcoded colors).
- Annotation notes (✎) explain non-obvious behavior, data sources, and open questions.
- Sample data: realistic Asia trip (Budapest → Bangkok Aug 31, Bangkok apartment for
  September, onward route TBD) — never real confirmation numbers or personal data.
- Roles shown where relevant: owner/editor · co-editor · viewer · follower (no account) · admin.

Review flow: owner walks each file's states in the browser → amendments noted as ✎ notes →
re-approved → matrix cell flips to ✅. Approved endframes are the acceptance criteria for
milestones M1–M4 (see docs/ARCHITECTURE.md roadmap update).

Sample data is canonical: every number/date/name in the mocks comes from `design/mocks/FIXTURES.md`.

## Gap decisions — walkthrough 2026-07-25

The nine gaps left open at the M0 gate were walked against the *implemented* app (not the
mocks) on 2026-07-25, 37 days before departure. Three turned out to be already built; the
owner chose to build all nine out. Scope below is binding — it is the acceptance criteria.

| # | Gap | Decision | State on 2026-07-25 |
|---|-----|----------|---------------------|
| 1 | plan-vs-actual DRIFT | **Build the affordance** — the badge alone isn't enough. Off-plan offers "shift the remaining stops by N days"; the plan is the thing that must change, not just the label. | Badge only (`LiveClient.tsx:392`, amber `off plan · last arrived X` vs green `on plan`), computed from the latest `arrived` event vs the planned stop. |
| 2 | post-trip "Done" phase | **Build the dashboard recap.** `/live` and `/follow` post states stay as they are. | `/live` handles `phase === 'post'` ("trip complete" / "Home again", `LiveClient.tsx:202`); `FollowClient.tsx:131` has its own pre/live/post. Dashboard has **no phase awareness at all**. |
| 3 | create-follow-link modal | **Add the QR code.** Label + expiry are done. | Built (`SettingsClient.tsx:142`): label, expiry defaulting to end date + 30 days, copy-to-clipboard. No QR. |
| 4 | traveller notification settings | **Build traveller push + a Settings section** — deadline push T-7/T-1 and follower/co-editor check-in notifications. A cancel-by deadline is real money and email is missable on the road; email stays as the fallback. | Followers can opt into push (`lib/follow/push.ts`); the **traveller has none**. Stay-deadline alerts are email-only (Edge Function `stay-deadline-alerts`). |
| 5 | account settings + GDPR deletion | **Build both** — trip danger zone (delete as owner / leave as member, type-the-name confirm) **and** account deletion cascading `auth.users`, storage objects, push subscriptions and share links. Open registration means non-family accounts can exist before departure. ✅ **built 2026-07-26** — migration 26 + `DangerZone`. | Nothing. No `deleteTrip` in `queries.ts`, no danger zone — **yet `docs/PHONE-TESTPLAN.md` F9 instructs "Settings → delete/leave the trip"**, so the 07-24 dogfood test trips were never cleaned up. |
| 6 | 03 overlapping-stops conflict | **Build the warning.** Correctness, not polish. | `SegmentForm.tsx:75` validates only that arrive/depart exist. Two stops may claim the same nights; the budget silently double-counts them. |
| 7 | permission-denied states | **Build the read-only viewer role** (with 8). Includes viewer-on-owner-URL and revoked-co-editor-mid-session. ✅ **built 2026-07-25** — see `docs/VIEWER-ROLE.md`. | — |
| 8 | 04 viewer read-only | **Same decision as 7 — one piece of work, not two.** Read `trip_members.role`, thread `canEdit` through the screens, hide edit affordances, honest permission-denied states. ✅ **built 2026-07-25.** | **The viewer role has no UI whatsoever.** `createInvite` hardcodes `'editor'` (`OnboardingWizard.tsx:88`); nothing reads a member role anywhere. Migration 06 *does* enforce `can_edit_trip` vs `can_view_trip`, so a viewer today would see full edit UI and have every write fail against RLS. |
| 9 | loading/skeleton states | **No endframes** — the only "skip the mock" decision on the list. Shipped behaviour is the spec. | `(app)/loading.tsx` (spinner + pulse blocks, every app route), added in dogfood round 1. |

Ordering constraint: **7+8 (viewer role) touches RLS-adjacent surface and must land before the
~Aug 22 RLS freeze** in the approved plan. 5 adds a migration and is subject to the same freeze.
1, 2, 3, 6 are client-only and can land any time, including from the road.

> Scope note: this walkthrough decided the **gaps list only**. The per-state ☐/☑/✅ cells in the
> matrix above were not individually re-approved — the mocks exist on disk, but implementation
> ran ahead of the cell-by-cell sign-off and the cells reflect that, not reality.
