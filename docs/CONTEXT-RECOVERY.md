# Context Recovery — the July 2026 "Fable" planning session

**Why this file exists:** The big planning/strategy conversation for this project happened
in a Claude session under a *different* login (a `claude-fable-5` session, 2026-07-10 → 07-12).
That conversation held the whole vision, the architecture decision, and a large body of
research. To make sure none of that knowledge is lost — and so work can continue from any
account or session — the substance has been extracted from the local session transcript into
this repo. Reconstructed 2026-07-22.

Nothing here needs the original chat to be reopened. But if you *do* want to resume the live
thread: sign the app into the **workplace/Fable account**, open this project folder, and the
session (`59b22d53-…`) is in that account's history.

---

## 1. The vision (in Patrik's words, 2026-07-10)

Turn the Asia trip planner into a real, functioning **trip planner *and* live trip follower**,
built so it's **portable to mobile from the same codebase**. Scope:

- **Plan any trip** — weekend to multi-month — map destinations, show attractions.
- **Live, on the ground:** mark in real time the attractions visited, restaurants eaten at;
  give **ratings** and **comments**.
- **Social later:** as more people use it, those ratings/experiences become **public** and
  shared between users — a full travel app over time.
- **Follow feature:** family back home can watch Patrik + girlfriend's Asia trip live — where
  they are, where they're staying, what they eat — following along as if there. Possibly
  **video uploads** → a social-media-like layer.
- **Business model on the side**, opportunistically (not chasing big money).

The trip is the hard deadline and the dogfood: **Budapest → Bangkok, Aug 31 2026**, home ~Feb 2027.

The original Hungarian feature notes (per-screen wishlist: custom city-palette theming,
weather/currency/visa trackers, flight-radar integration, bank-sync for costs, stay-deadline
notifications, timeline table, cheat-sheet overview, family sharing, etc.) are preserved
verbatim in the raw transcript backup (see §5).

---

## 2. The decision that was made

After a 12-agent strategy workflow (3 architecture designs + a product roadmap, each
adversarially critiqued), Patrik chose:

> **Architecture: Hybrid, phased** (Option C, tempered by roadmap Option D).

- **Pre-trip:** evolve the existing **Next.js app in place as a PWA** — no migration, ship fast.
- **Post-departure:** extract a **pnpm monorepo** (`packages/core` + `packages/data`; queries
  already take a `SupabaseClient`, so they lift out cleanly) + an **Expo companion app**
  (SDK 56+, NativeWind, MapLibre flat map — the 3D globe stays web-only).
- **Rejected:** Expo-only web (SEO second-class in 2026); shared-UI frameworks (Tamagui/RSD).

> ⚠️ **AMENDED 2026-07-28 — the Expo companion is dropped.** Android now ships as a
> **Trusted Web Activity** wrapping the PWA, iOS as a **native SwiftUI app**, both targeted
> before departure. React Native / NativeWind leave the roadmap entirely, and the monorepo
> extraction loses its forcing function. The pre-trip Next.js/PWA line above is unchanged.
> Rationale, costs, and the App-Review latency caveat:
> **[`PLATFORM-DECISION_2026-07-28.md`](PLATFORM-DECISION_2026-07-28.md)**.

**Three data regimes** (deliberate, do not "normalize" everything):
1. **Plan** stays `jsonb` last-write-wins (never normalize).
2. **Lived trip** is born relational + append-only (`places`, `trip_events`, `check_ins`,
   `media`, `trip_shares`).
3. **World data** = catalogue + cron-cached tables.

The full approved roadmap (milestones M0–M4, verified security holes, integration choices) is in
**[`archive/APPROVED-PLAN_2026-07-10.md`](archive/APPROVED-PLAN_2026-07-10.md)** — the canonical plan.

---

## 3. Where the session actually stopped (the open decision)

The session got through **M0 (design mock kit)** and most of **M1 (security)** before it ended
mid-task. Concretely, as of 2026-07-12:

**Done and on disk (all uncommitted in the working tree):**
- **Static fallback app disarmed** — `js/cloud.js` `cloudPush` no-ops, shows a "read-only" badge
  (closes the "old open tab clobbers a day of edits" hole).
- **Security milestone M1 (items 1–4)** authored + adversarially reviewed + fixes applied:
  `supabase/migrations/06-security.sql` (role-aware RLS, owner-freeze `WITH CHECK`, invite
  self-escalation fix, `state_rev`/`ledger_rev`, ledger merge RPCs) + `06-TESTPLAN.md`;
  matching write-guard fixes in `schema.sql`, migrations `01`/`02`, and the product mutation
  hooks (`useTripMutation.ts`, `useLedgerMutation.ts` — a MAJOR double-apply bug was fixed).
  `tsc --noEmit`, `next build`, `node --check js/cloud.js` all pass.
  **⚠ The migration is NOT applied to any database** — it's waiting to be run against staging first.
- **M0 design mock kit** — all 10 endframe screen mocks in `design/mocks/` + the `design/SCREENS.md`
  coverage matrix, each individually audited/fixed, both themes, phone + desktop.

**The fixture-canonicalization sweep DID complete** (resolved 2026-07-22 by checking file
mtimes + the canonicalize agent's transcript): although the chat log ends at 10:47 on Jul 12
with the sweep paused, a background agent re-ran and finished it by 12:46 that day. Deliverables,
all verified present and consistent:

- `design/mocks/FIXTURES.md` — the canon data sheet ("this sheet is law"): budget cap 4.5M /
  planned 4,120,000 HUF = 92% amber, flight 372,000 HUF, FX 1 THB = 10.4 HUF, Bangkok 30 nights,
  canonical check-ins, sharing counts (2 followers + 1 viewer), HUF format rules, nav rules.
- All 10 mocks rewritten against it (no divergent values remain on spot-check).
- `design/SCREENS.md` gained a **"Known gaps (decide at walkthrough)"** list: drift endframe,
  post-trip phase, create-follow-link modal, notification settings, GDPR deletion,
  overlapping-stops conflict, permission-denied states, 04 viewer read-only, skeletons.

👉 **The exact resume point is therefore the M0 gate itself:** Patrik walks all 10 mocks
(every role/phase/data state), decides each Known-gaps item, and signs off. After the gate:
rest of M1 (multi-trip, onboarding wizard, stay-deadline alerts) + run migration 06 against
staging per `06-TESTPLAN.md`.

---

## 4. Verified security holes the plan fixes (migration 06)

- Role-blind `can_access_trip` (viewers could act as editors).
- `trips_update` had no `WITH CHECK` → owner-hijack possible.
- Invitees could self-escalate to editor.
- `makeDefaultState()` copied real booking data into new trips (privacy leak).

---

## 5. Recovered artifacts in this repo

| What | Path |
|---|---|
| **This recovery index** | `docs/CONTEXT-RECOVERY.md` |
| **Canonical approved roadmap (M0–M4)** | `docs/archive/APPROVED-PLAN_2026-07-10.md` |
| **12-agent strategy research** (code map, DB map, cross-platform + integration API research, designs A/B/C/D, all critiques) | `docs/archive/strategy-research_2026-07-10/` (see its `01…12` files) |
| **Raw session transcripts** (Fable 07-10, Opus 06-27) + subagent traces + workflow journals | `docs/archive/transcripts/` |
| **Design mock kit (M0)** | `design/mocks/` + `design/SCREENS.md` |
| **Security work (M1)** | `supabase/migrations/06-security.sql`, `06-TESTPLAN.md`, `supabase/schema.sql`, product hooks |

> **Note:** `docs/archive/transcripts/` is **git-ignored** — raw transcripts can contain pasted
> secrets and this repo has a public remote, so they are backed up locally but never pushed.
> The extracted research and plan docs *are* safe to commit.
