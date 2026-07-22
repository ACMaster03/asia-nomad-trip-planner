# Adversarial critique of Option C (Monorepo hybrid)

Verified against `/Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner` (code, migrations, docs) and targeted web checks. The design's core mechanical claims mostly check out; its sequencing and its security story around followers do not.

## What the design gets RIGHT (verified, so the critique below is not a strawman)

- The client-injection seam is real: `product/src/lib/trips/queries.ts` and `lib/catalogue/queries.ts` take a `SupabaseClient` argument; the four hooks (`useTripScreen`, `useTripMutation`, `useLedgerMutation`, `hooks/useIsAdmin.ts`) each import `@/lib/supabase/client` directly and need exactly the one-line context swap claimed.
- The dormant normalized tables (`segments`, `stays`, `transport`, `extras`, `notes`, `ledger`) exist in `supabase/schema.sql` with RLS, unused by the app — accurately described.
- `fetchActiveTrip` is indeed "newest visible row" (order by `updated_at`, `created_at`); the multi-trip prerequisite is real.
- `Stay` in `lib/trips/types.ts` has no cancellation-deadline field — correctly flagged.
- `globeData.ts` splits cleanly: `loadMapOpts`/`saveMapOpts` are the only localStorage touchers; `buildRoute`/`buildArcs`/`seasonalHazards`/`quakesFromFeed` are pure.
- Versions: Next 16.2.9, React 19.2.4, Tailwind 4, `@supabase/ssr` 0.12, TanStack Query 5 (product/package.json). Expo SDK 56 (released 2026-05-21) really ships RN 0.85 + React 19.2, and Hermes V1 (default in SDK 56) does provide `structuredClone` — the design's claim holds, but only on SDK ≥ 56.
- Supabase free-tier figures (1 GB storage, 2M realtime msgs, 200 connections) are correct and consistent with DATABASE.md.

---

## Findings

### BLOCKER 1 — The timeline misses the actual trip, and the design doesn't know when the trip is
`defaultState.ts` (verbatim port of the owner's live data) contains **REAL bookings**: Beijing hotel Aug 31–Sep 5 2026 ("REAL BOOKING… Free cancel until Aug 29"), BUD→PVG flight **Sep 3, 2026** ("REAL BOOKING", Conf# present), with the SE-Asia main leg starting Oct 1. Today is **July 10, 2026** — departure is ~7.5 weeks away. The plan's M0+M1+M2 = 5.5–7.5 **person-weeks** before family can follow anything, and M3 (the LIVE mobile app, the whole point of the trip-as-dogfood) at 9.5–13.5 person-weeks. The design silently equates person-weeks with calendar weeks for a solo dev who has a day job — realistically the Expo app arrives weeks-to-months *into* the trip, and web follow lands with zero slack. Worse, M1 (dashboard cosmetics, theming, "cheat sheet") is sequenced *before* M2 (follow).
**Fix:** Invert M1/M2. Ship a "M2-lite" in the next 4–5 weeks inside the existing app: `trip_events` + share-link read-only follow page + a mobile-web (responsive/PWA) check-in + quick-expense form. The schema and `@anp/data` hooks are the durable investment; the Expo app can ship mid-trip (check-ins backfill fine). Do M0 either immediately in week 1 with prod pinned to the pre-move commit, or defer it entirely until after departure — a repo-wide `git mv` + npm→pnpm + import rewrite in the final weeks before a real trip is the exact "breaking the working app" risk the brief forbids.

### BLOCKER 2 — Follower role = privilege escalation with the RLS as written
Verified in `supabase/schema.sql` and `migrations/02-invites.sql`:
- `can_access_trip()` checks membership **ignoring `role`**; `trips_update` uses `can_access_trip(id)` — any `trip_members` row can rewrite `state` and `ledger`.
- `has_pending_invite()` ignores the invite's `role`; `members_insert` lets any invitee **self-insert into `trip_members`** (role defaults to `'editor'`, and the policy doesn't constrain the inserted role to match the invite).

The design's plan — "invited via the existing `trip_invites` machinery with a new role `'follower'`" — therefore lets any follower-invited user add themselves as a full editor and read/write the entire trip. Even today a `'viewer'` invite is escalatable; the `role` column is decorative.
**Fix (must land in migration 06, before any follower ships):** split `can_access_trip` into `can_edit_trip` (owner or member with role='editor') vs `can_view_trip`; change `trips_update` and child-table policies to `can_edit_trip`; constrain `members_insert` self-inserts to `role = (select role from trip_invites …)` and route `'follower'` acceptances into `trip_followers` only.

### MAJOR 3 — Ledger LWW + "mobile is the expense writer" = money-data loss; the proposed mitigation doesn't work
Verified: `writeLedger` overwrites the entire jsonb array; `useLedgerMutation.mutationFn` builds the array from the **local query cache**. The design's fix ("id-union merge in `useLedgerMutation`") is a client-side read-modify-write: it still races (two devices union-merging against stale caches, no transaction) and union-merge **resurrects deletions**. Owner-on-phone vs girlfriend-on-web editing money the same day is the *most likely* conflict on this trip, not an edge case.
**Fix:** merge server-side — either an RPC that appends/removes by id in one SQL statement (`update trips set ledger = …`), or activate the dormant normalized `public.ledger` table (already in schema.sql with RLS) for mobile writes. Note the second option requires migrating web's `LedgerTab` too — effort absent from every estimate.

### MAJOR 4 — No offline story for the flagship mobile use-case
"Mark attractions in real time" happens on islands, hikes, and metros with no data. Mobile v1 (Today/Feed/Money) as designed is fully network-dependent: TanStack Query mutations are not persisted, so an offline check-in or expense is simply lost on app kill. The design discusses offline only as a risk to *avoid* (`trips.state`), never as a capability the LIVE mode needs.
**Fix:** design `trip_events` writes as an offline append queue from day one (client-generated UUIDs, idempotent inserts, `persistQueryClient` + AsyncStorage persister). Append-only events make this cheap — but only if specified in M3's scope (+0.5–1 wk).

### MAJOR 5 — Live GPS broadcast is publicly subscribable as specified
Supabase Realtime **Broadcast channels are public by default**; the design's `trip:{id}:live` channel never mentions private channels / `realtime.messages` authorization. Trip UUIDs will leak (share-link pages, public events), after which anyone with the anon key can stream two real people's live location. Separately: account-less share-link followers ("grandma") *cannot* do authenticated realtime at all — their page must poll `trip_live_state` via the token RPC, which the design doesn't state.
**Fix:** private channels + RLS authorization for members/followers; polling via the token RPC for anonymous links; hash share tokens at rest; rate-limit the security-definer RPC.

### MAJOR 6 — Share-link projection is unspecified and the state document is toxic to leak
`trips.state` contains booking confirmation numbers (a real `Conf# 6796474396` and a `secure.booking.com/myreservations` URL are literally in the seed), prices, budget cap, and private notes. A token RPC returning raw `state` (the naive implementation of "read-only itinerary") leaks all of it to anyone a family member forwards the link to. jsonb can't be column-filtered by RLS.
**Fix:** the RPC must return an explicit sanitized projection (cities, dates, coordinates, feed, last position — never `state`, `ledger`, notes, URLs, confirmation numbers). Spell this out in migration 06's contract.

### MAJOR 7 — Profiles RLS breaks the feed the design promises
Verified in `migrations/03-catalogue.sql`: `profiles_select` is **self-or-admin only**. The follower feed ("X checked in at Wat Pho"), follower counts in Settings, and public community pages all need author display names; today even the girlfriend can't read the owner's `display_name`. No migration in the design addresses this.
**Fix:** migration 06 adds a public-safe profile surface (view exposing `id, display_name` to co-members/followers, and to anon for public events).

### MAJOR 8 — SEO/public pages vs `to authenticated` catalogue RLS
Verified in migration 03: `cities`/`countries`/`catalogue_fields` select policies are `to authenticated`. The M5 `/city/[slug]` SEO pages — the stated reason web stays Next.js — render **empty** for anonymous crawlers/users as the DB stands. Same problem for the share-link page if it uses `fetchCities` for coordinates.
**Fix:** add `to anon` select on catalogue tables (it's public data) or render public routes with a server-side service-role client; either way it must be a named migration/work item, currently missing.

### MAJOR 9 — Store-review realities contradict M3's scope
(a) iOS background location ("significant-change background mode") needs "Always" permission, `UIBackgroundModes`, and an App Review justification that frequently triggers rejection for non-navigation apps; Play requires a background-location declaration. (b) A public store release with a UGC feed triggers Apple guideline 1.2 (report/block/moderation/EULA) — but moderation is deferred to M5 while the store ship is M3. (c) If M3 instead stays on TestFlight for family, builds expire after 90 days — a mid-trip re-invite/rebuild on hotel Wi-Fi.
**Fix:** M3 ships foreground-only location (broadcast while open; check-ins persist position) + TestFlight/internal-track distribution, with a scheduled mid-trip build refresh; public store release aligns with M5 moderation.

### MINOR 10 — Mux free tier is misread
Web-verified: Mux's free plan is **10 stored assets total** + 100k delivery min/mo — not "10 videos per month". A multi-month trip with regular video exhausts it in days. Fix: budget paid video (Mux usage-based or Cloudflare Stream ~$5/mo class) or de-scope video past M4.

### MINOR 11 — Multi-trip refactor is understated
`tk.activeTrip` is a single global cache key consumed by 12+ files including server `prefetch.ts`, and both mutation hooks read the trip **from that key**. Re-keying by trip id + an active-trip selector touches every tab. Mechanical, but it's days inside M1, not the "small" aside the design calls it.

### MINOR 12 — Root-level React `overrides` creates the coupling the design warns about
Apps are separate bundles; the correct pattern is `react` as a **peerDependency with a range** in `@anp/data`, letting Next and Expo upgrade independently, guarding only against duplicate React *within one app*. A hard root override manufactures the "future Next needs React 20 before Expo supports it" blockage listed in its own Risk 2.

### MINOR 13 — Factual slippage (all optimistic-direction, none load-bearing)
- "≈690 lines verbatim into core" is ~536 measured (406 in trips/catalogue pure modules + ~130 pure globeData); "~235 data lines" is ~203; "~2,400 lines of components" is 2,325 (components 1,689 + app routes 636 of 3,197 total src). The 20–25% shared-code claim holds (~21%).
- "supabase/ migrations move to repo root" — they are **already** at the repo root, outside `product/`. Zero work misdescribed as work.
- ARCHITECTURE.md's Open decisions contain **no share-link question** to "resolve" (they list tiers, catalogue moderation, realtime, mobile, i18n — the moderation one is real).
- Metro symlinks: support arrived in **Metro** 0.79 and is stable/default since **RN 0.73**, not "stable since RN 0.79".
- "Email via Supabase" for web followers — Supabase sends auth emails only; notifications need Resend/Postmark or should be dropped.
- No `push_tokens` table appears in the migration list despite push being an M3 deliverable.
- Solito 5's "pivot" and RSD "discussion #270" are unverifiable-as-cited; the shared-UI rejection stands on team-size grounds regardless — soften or cite.
- M0 omissions that fit inside its estimate but should be named: npm→pnpm lockfile swap (repo currently has `package-lock.json`), Vercel root-directory + install-command change, `transpilePackages` in `next.config.ts` for source-consumed `@anp/*`.

---

## Verdict

**SOUND-WITH-FIXES.** The architecture itself (two thin UIs over the verified client-injection seam, document model for the plan + normalized rows for live data, web-first follow) is the right shape for this codebase and this team — the extraction really is as cheap as claimed. What's wrong is the schedule's contact with reality and the security of everything follower-facing.

The 3 fixes that matter most:
1. **Resequence around the ~Sep 3 departure:** M2-lite (trip_events + sanitized share-link follow + PWA check-in/expense form in the existing app) before M1 polish; monorepo M0 either week-1-with-prod-pinned or post-departure; Expo app mid-trip.
2. **Role-aware RLS before any follower exists:** `can_edit_trip`/`can_view_trip` split, role-constrained invite self-acceptance, follower acceptances into `trip_followers` only — plus private Realtime channels and a sanitized share-link RPC (never raw `state`).
3. **Kill LWW for money and events on mobile:** server-side ledger merge RPC or activate the dormant normalized `ledger` table, and build `trip_events` as an offline-first append queue with client UUIDs.

Sources: [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56), [Expo SDK 56](https://expo.dev/sdk/56), [Hermes structuredClone issue #684](https://github.com/facebook/hermes/issues/684), [Expo `structuredClone` docs](https://docs.expo.dev/versions/latest/sdk/expo/), [Mux Free Plan announcement](https://www.mux.com/blog/free-plan), [Mux video pricing](https://www.mux.com/docs/pricing/video)

### Critical Files for Implementation
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/supabase/schema.sql (role-blind `can_access_trip` + `trips_update` — the privilege-escalation hole any follower work must fix first)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/supabase/migrations/02-invites.sql (`has_pending_invite` + `members_insert` self-insert path that lets a follower invite become an editor)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/trips/useLedgerMutation.ts (whole-array LWW write from local cache — replace with server-side merge before mobile writes money)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/supabase/migrations/03-catalogue.sql (`profiles_select` self-only + `to authenticated` catalogue policies that break the feed and the SEO pages)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/trips/defaultState.ts (proof of the real Sep 3, 2026 departure and of the confirmation-number/URL data a naive share-link RPC would leak)