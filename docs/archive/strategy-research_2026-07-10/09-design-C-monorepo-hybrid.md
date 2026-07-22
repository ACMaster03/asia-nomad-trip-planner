# Option C Design: Monorepo Hybrid — Next.js Web + Expo Mobile over Shared Core Packages

Design for evolving `/Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner` into a pnpm/Turborepo monorepo where the existing Next.js app stays the primary web surface, a new Expo app becomes the on-trip/follower surface, and everything non-visual lives in shared packages.

---

## 1. Architecture & repo structure

### 1.1 Core UI decision: do NOT share UI. Two thin UI layers over shared hooks.

Rejected alternatives, with reasons grounded in the 2026 landscape:

- **react-native-web everywhere / Expo-only web** — RNW is in maintenance mode; Expo web is second-class for SEO/content, and the public community/catalogue pages (pillar 4) are exactly the SEO-content surface Next.js is for. Would also mean throwing away a working Tailwind 4 app.
- **Tamagui + Solito** — Solito 5 itself pivoted web rendering back to pure Next.js/HTML, which is a strong market signal that "one UI tree on both platforms" is being abandoned even by its proponents. A Tamagui rewrite of ~2,400 lines of working Tailwind components buys nothing the owner's users can see, and costs 3–4 weeks.
- **React Strict DOM** — Meta-internal maturity, adoption cautioned by its own maintainers (discussion #270). Wrong bet for a 1-dev team in 2026.

What IS shared: **types, domain math, Supabase queries, TanStack Query hooks, query keys, formatting**. The exploration confirms this is already cleanly isolated (~20–25% of the code, Buckets A–C in the code map) and reads through hooks — the UI layers on both platforms become thin renderers over `useTripScreen`-style hooks. This is the mainstream, low-risk 2026 pattern ("plain shared packages; navigation and UI native to each platform"). The web app keeps Tailwind/shadcn-style DOM components; mobile gets React Native primitives + NativeWind (Tailwind-syntax styling on RN, so the mental model of class-based styling carries over without sharing actual components).

The one deliberately divergent surface: **the map**. globe.gl stays web-only (it needs a DOM canvas; the expo-gl path is fragile and physical-device-only). Mobile v1 uses **MapLibre RN** (free, OpenFreeMap tiles) with a 2D route + live-position view. The 3D globe is a web "wow" feature; the mobile map is a utility. Accepting divergence here is the single biggest simplification in this whole design.

### 1.2 Repo layout (concrete)

```
asia-nomad-planner/                      # repo root becomes the monorepo root
├── pnpm-workspace.yaml                  # packages: apps/*, packages/*
├── turbo.json                           # build/lint/typecheck/test pipelines
├── package.json                         # private root; scripts delegate to turbo
├── apps/
│   ├── web/                             # ← the EXISTING product/ app, moved (git mv product apps/web)
│   │   ├── src/app/...                  # unchanged routes; imports rewritten to @anp/*
│   │   ├── src/components/...           # all DOM components stay here
│   │   ├── src/lib/supabase/            # @supabase/ssr factories stay web-local (client/server/proxy)
│   │   ├── src/lib/prefetch.ts          # stays web-local (uses next/headers server client)
│   │   └── src/proxy.ts
│   └── mobile/                          # NEW — Expo SDK 56 (RN 0.85, React 19.2 — matches web's React 19)
│       ├── app/                         # expo-router file routes
│       │   ├── (auth)/login.tsx
│       │   ├── (tabs)/today.tsx         # live-mode home: where are we, next stop, check-in CTA
│       │   ├── (tabs)/map.tsx           # MapLibre RN route + live positions
│       │   ├── (tabs)/feed.tsx          # follower feed (check-ins, photos, notes)
│       │   └── (tabs)/money.tsx         # quick expense entry (ledger only, not budget planning)
│       ├── src/lib/supabase.ts          # supabase-js + AsyncStorage/SecureStore session (mobile-only)
│       ├── src/lib/push.ts              # expo-notifications registration
│       └── eas.json                     # EAS Build/Submit profiles
├── packages/
│   ├── core/                            # @anp/core — ZERO deps beyond TS. Bucket A verbatim.
│   │   └── src/{trips,catalogue,map}/   # types, budget math, format, defaultState, keys, getAtJsonPath,
│   │                                    #   pure globeData transforms (buildRoute/buildArcs/seasonalHazards)
│   ├── data/                            # @anp/data — deps: @anp/core, @supabase/supabase-js, @tanstack/react-query
│   │   └── src/
│   │       ├── queries/                 # trips/queries.ts, catalogue/queries.ts (already take SupabaseClient)
│   │       ├── hooks/                   # useTripScreen, useTripMutation, useLedgerMutation, useIsAdmin
│   │       ├── live/                    # NEW: useCheckins, useTripFeed, useLivePresence (Realtime broadcast)
│   │       └── db/                      # generated Supabase types (supabase gen types) — single source of truth
│   └── config/                          # @anp/config — shared tsconfig base, eslint config
├── supabase/                            # migrations move to repo root (shared by both apps)
│   ├── migrations/                      # existing 01–05 + new 06+ (multi-trip, checkins, follows, media)
│   └── schema.sql
├── index.html, js/, cities.json         # legacy static app — untouched, still the fallback; excluded from workspace
└── docs/ARCHITECTURE.md                 # updated to describe the monorepo
```

Key mechanical decisions:

- **pnpm** workspaces + **Turborepo**. One gotcha to plan for: Metro (Expo's bundler) historically dislikes pnpm symlinks; Expo SDK 56 supports pnpm but set `node-linker=hoisted` in `.npmrc` or use Metro's `unstable_enableSymlinks` (stable since RN 0.79). Budget half a day for this, not zero.
- **Dependency injection of the Supabase client stays exactly as it is today**: `fetchActiveTrip(supabase)` etc. already take a `SupabaseClient` argument — this is the seam that makes the whole option cheap. Each app owns its client factory (web: `@supabase/ssr` cookies; mobile: `supabase-js` + `AsyncStorage` for session, `expo-secure-store` for the refresh token). The hooks in `@anp/data` get the client from a tiny `SupabaseProvider` React context each app supplies.
- **React version lockstep**: Expo SDK 56 ships React 19.2 and web is on 19.2.4 — aligned today. Pin React via pnpm `overrides` at the root so the two apps can't drift (a drifted React duplicated into shared hook packages is the classic monorepo failure).
- **Auth on mobile**: magic-link works but is miserable on phones. Mobile v1 should add **Sign in with Apple + Google** (Supabase native OAuth; Apple sign-in is mandatory for App Store if any other social login exists). This is a Supabase dashboard + `expo-auth-session` task, no schema change; web gets the same providers for free.

### 1.3 Long-term division of responsibilities

| Surface | Owns | Never does |
|---|---|---|
| **apps/web** | Planning desk (full itinerary/budget CRUD), 3D globe, admin catalogue editing, public SEO pages (city guides, public trip pages, community ratings), Stripe billing, settings/onboarding | Live location capture, camera, push-critical flows |
| **apps/mobile** | LIVE mode (check-ins, ratings, comments, photo/video capture), follower experience (feed + live map + push), quick expense entry, cancellation-deadline notifications | Full trip planning UI, catalogue admin, the WebGL globe |
| **packages** | All domain logic, all Supabase I/O, all realtime channel logic, all money math | Anything that imports `next/*`, `react-dom`, `react-native`, or touches `localStorage`/`AsyncStorage` directly (storage adapters injected) |

This split matches real usage: you plan a multi-month trip on a laptop; you live it and follow it on a phone. It also means neither app ever blocks the other's release.

---

## 2. Reused vs rewritten (real files)

BASE = `apps/web/src` after the move (today `product/src`).

### Moved verbatim into `packages/core` (≈690 lines, zero changes except import paths)
- `lib/trips/types.ts`, `lib/trips/budget.ts`, `lib/trips/format.ts`, `lib/trips/defaultState.ts`, `lib/trips/keys.ts`
- `lib/catalogue/types.ts`, `lib/catalogue/keys.ts`, `lib/catalogue/getAtJsonPath.ts`
- The pure half of `lib/map/globeData.ts` (`buildRoute`, `buildArcs`, `seasonalHazards`, `quakesFromFeed`, `isoToFlag`, `COUNTRY_ALIAS`, `quakeSafetyNote`) — mobile's MapLibre view reuses `buildRoute` for the polyline. `structuredClone` in `defaultState.ts` is fine on Hermes.

### Moved into `packages/data` with minor edits (≈235 lines)
- `lib/trips/queries.ts`, `lib/catalogue/queries.ts` — verbatim (already client-injected).
- `lib/trips/useTripScreen.ts`, `useTripMutation.ts`, `useLedgerMutation.ts`, `hooks/useIsAdmin.ts` — one edit each: replace the direct import of `lib/supabase/client.ts` with a `useSupabase()` context hook. The optimistic-update/scope-serialized mutation pattern ports to RN unchanged.

### Stays in apps/web unchanged (web-bound, correctly so)
- All of `src/app/**` (routes, layouts, auth callback/confirm handlers), `src/proxy.ts`, `lib/supabase/{client,server,proxy}.ts`, `lib/trips/prefetch.ts` (it needs the Next server client), all of `src/components/**` including `Globe.tsx`, `CountryPanel.tsx`, `HazardPanel.tsx`, the forms and tabs. The `loadMapOpts/saveMapOpts` localStorage half of `globeData.ts` stays web-local.

### Rewritten / net-new for mobile (nothing is "ported" — mobile UI is new by design)
- Login screen, tab navigation (expo-router), Today screen, MapLibre map, feed, quick-expense form. These consume `@anp/data` hooks; e.g. mobile's expense form calls the exact same `useLedgerMutation` the web `LedgerTab.tsx` calls.
- `Modal.tsx`, `Tabs.tsx`, `Stat.tsx` get RN analogues (~1 day total; they're small).

### Net-new for the vision (both platforms, lives in packages + migrations)
- `packages/data/src/live/*` (Realtime channel hooks), new migrations 06+ (below), Edge Functions for push fan-out and integration caching. There is no existing code for check-ins, follows, media, or realtime — the exploration confirmed all of it is greenfield.

### Explicitly abandoned
- The root static app (`index.html`, `js/*.js`) stays frozen as fallback, outside the workspace. The unused normalized itinerary tables in `schema.sql` (`segments`, `stays`, `transport`, `extras`, `notes`, `ledger`) stay dormant — this option keeps the **document model** for the plan (`trips.state`) and adds **normalized tables only for the new social/live data**, which is the honest minimum: plan editing is single-couple LWW today and works; live events need rows for realtime + RLS granularity.

---

## 3. How the vision's pillars land

### 3.1 Live check-ins / ratings / comments (pillar 3 → later pillar 4 community data)
New migration `06-live.sql`:
- `trip_events` — `id uuid, trip_id, author uuid, kind ('checkin'|'meal'|'note'|'arrival'|'media'), place_ref (nullable → catalogue city or landmark key, or freeform name+lat/lng), rating smallint null, body text, media jsonb, lat/lng, created_at, visibility ('trip'|'followers'|'public' default 'trip')`. RLS: insert by trip members; select by `can_access_trip` OR (follower AND visibility≥followers) OR (visibility=public).
- This one table is deliberately the seed of the community platform: a check-in with `rating` + `visibility='public'` **is** a community review. No separate ratings schema later — you flip visibility and aggregate. Aggregation into `cities.attributes`/a `place_stats` materialized view happens when volume justifies it (M5).
- Mobile is the primary writer (`useCreateEvent` hook in `@anp/data`); web renders the same feed read-only on the Dashboard.

### 3.2 Family follow — live (pillar 5)
- New tables: `trip_followers` (`trip_id, user_id, added_at`, invited via the existing `trip_invites` machinery with a new role `'follower'` — migration extends the role check constraint) and a public **share-link** path: `trip_share_links (token, trip_id, scope, revoked)` + an RLS-bypassing Edge Function or a `security definer` RPC for token reads, so grandma doesn't need an account (open question in ARCHITECTURE.md resolved: link-based read access, account optional).
- **Live position**: Supabase Realtime **Broadcast** channel `trip:{id}:live` (not Postgres Changes — avoids write amplification per the realtime research). Traveller's phone publishes position every 2–5 min while LIVE mode is on (`expo-location`, foreground + significant-change background mode); followers subscribe on web or mobile. Last-known position also persisted to a single `trip_live_state` row (upsert) so late joiners see something without replay.
- **Feed updates**: Postgres Changes subscription on `trip_events` filtered by `trip_id` — low frequency, row-granular, fits within free-tier message caps for a family-sized audience (≤10 concurrent followers ≪ 200 connection limit).
- Realtime channel logic lives in `packages/data/src/live/` and is **identical code on web and mobile** — supabase-js Realtime is fully cross-platform, one of the strongest arguments for this option.
- **Push**: `expo-notifications` + Expo Push service (free) for "X checked in at Wat Pho" to follower phones, and for the stay free-cancellation-deadline reminders from the feature notes (a Supabase scheduled Edge Function scans `trips.state.stays` nightly for `status='booked'` deadlines — note: deadline field must be added to the `Stay` type in `packages/core`). Web followers get nothing pushed (acceptable) or email via Supabase.

### 3.3 Media upload (photos/video of the trip)
- Photos: `expo-image-picker`/`expo-camera` → Supabase Storage bucket `trip-media` (RLS by trip membership), rows in `trip_events` with `kind='media'`. Client-side resize before upload (free tier = 1 GB storage / 5 GB egress; a multi-month trip of compressed photos fits; Pro at $25/mo is the natural first paid infra step).
- Video: **Mux free tier** (10 videos / 100k delivery min per month) from day one rather than raw MP4s in Storage — adaptive streaming matters on hotel Wi-Fi, and the free tier covers a 2-person trip. Upload via Mux direct-upload URL minted by an Edge Function; store the playback ID in `trip_events.media`.

### 3.4 Community / public data (pillar 4) + one-page integrations (feature notes)
- Public surface is **web-only** (SEO): `/city/[slug]` pages rendered from the catalogue + aggregated public `trip_events`. This is precisely why web stays Next.js.
- Integrations land as **Supabase Edge Functions + cron → cached tables**, consumed identically by both apps through `@anp/data`:
  - FX: Frankfurter daily cron → `fx_rates` table (replaces hand-maintained `state.rates` over time).
  - Weather: Open-Meteo per catalogue city (careful: commercial licence once monetized; self-host later).
  - Safety: keep USGS client-side on the web globe; add GDACS + FCDO/State Dept crons → `hazards` table (already sketched in ARCHITECTURE.md §server-side bits).
  - Flights: AeroDataBox (600 free units) for the Transport tab's "FlightRadar integration" ask — status lookup by flight number, cached per leg.
  - Open banking (Enable Banking, HU/OTP): **deferred to M6+**; it's an Edge-Function-only integration writing into the existing `ledger` document, so nothing in this architecture blocks or depends on it.
- None of these touch app code beyond a query hook — the cache-in-Postgres pattern means mobile gets every integration for free.

### 3.5 Multi-trip + onboarding (prerequisite the code map exposes)
`fetchActiveTrip` = "newest visible row" — fine for one couple, broken for followers (a follower's newest visible trip may be someone else's). Migration + code change: explicit `active_trip_id` per profile (or a trip picker), `tk.activeTrip` keyed by trip id. This is small but **must precede** the follow feature and is called out as its own milestone step.

---

## 4. Phased milestones (1 skilled dev + Claude Code; person-weeks)

**M0 — Monorepo extraction (1–1.5 wk).** pnpm-workspace + turbo; `git mv product apps/web`; create `packages/{core,data,config}`; move Bucket A/B/C files; add `SupabaseProvider` context; fix imports to `@anp/*`; root React override; verify Vercel deploy from `apps/web` (set root directory in Vercel). Zero user-visible change — this is the milestone most tempting to skip and most costly to skip.

**M1 — Web polish + multi-trip foundation (2–3 wk).** The owner's feature notes that are pure web work: dashboard re-layout (stat blocks 2x2 + progress bar, "cheat sheet"), timeline filters, stays decluttering + chronological order, theming (Tailwind 4 CSS-first: theme toggle via `data-theme`, accent palettes; destination palettes = a `themes` table, admin-seeded), onboarding wizard (trip name/start/travellers/budget cap → `makeDefaultState` params). Plus `active_trip_id` + trip switcher. Real trip is upcoming — this milestone serves the actual users now.

**M2 — Live/social schema + web follow (2–3 wk).** Migrations 06–07 (`trip_events`, `trip_followers`, `trip_share_links`, role `'follower'`, `trip_live_state`); `packages/data/live/*` hooks; web feed on Dashboard; public share-link trip page (read-only itinerary + feed + last position on the globe). **Ship follow on web first** — family can follow in a browser before any app store is involved, de-risking the whole social pillar.

**M3 — Expo mobile v1: the LIVE companion (4–6 wk).** Expo SDK 56 app; Apple/Google + magic-link auth; Today / Map (MapLibre) / Feed / Money tabs; check-ins with rating+photo; live location broadcast; push registration + deadline/check-in notifications; EAS Build; TestFlight + Play internal track. Scope discipline: **no plan editing on mobile v1**. Store review adds elastic calendar time (~1–2 wk waiting, overlappable). This is the milestone where the shared packages pay out: the data layer is done, so 4–6 wk is almost all RN UI + device APIs.

**M4 — Media + integrations (2–3 wk).** Storage bucket + photo pipeline; Mux video; FX/weather/safety/flight crons + Edge Functions; surface in both apps.

**M5 — Community v0 (3–4 wk).** Public visibility on events; `/city/[slug]` SEO pages aggregating public ratings; moderation basics (report flag + admin queue — resolves ARCHITECTURE.md's open question in favor of moderated contributions); profile pages.

**M6 — Monetization + open banking (2–3 wk).** Stripe on web, RevenueCat if mobile-side purchase needed; Enable Banking expense import as a premium feature.

Total to a store-shipped mobile v1 with live follow: **~10–14 person-weeks** (M0–M3). Full vision through M6: ~19–26 pw.

---

## 5. Risks & failure modes; what this option makes HARD

1. **Two UI codebases forever, one developer.** Every cross-cutting feature (e.g., a new event kind) needs two renderings. Mitigation is scope discipline (the responsibility table in §1.3), not tooling. If mobile scope creeps toward "the whole planner on the phone", this option quietly becomes 2x cost — that is its canonical failure mode.
2. **Monorepo/tooling friction.** Metro + pnpm symlinks, Expo SDK ↔ React ↔ Next version lockstep (today aligned at React 19.2; a future Next requiring React 20 before Expo supports it would block upgrades — pin and upgrade deliberately). Turborepo cache misconfig can silently ship stale `@anp/core` — enforce `dependsOn: ["^build"]` or use TS project references / direct-source imports (`"main": "./src/index.ts"` consumed transpiled by each app) to avoid a build step entirely; the latter is recommended for a 1-dev repo.
3. **LWW document model meets mobile offline.** A phone editing `trips.state` offline (even just ledger) then syncing can clobber web edits — the exact known limitation in DATABASE.md, now with worse odds. Mitigations baked into this design: mobile v1 writes go to *new normalized tables* (`trip_events`) and to `ledger` (append-mostly, mergeable by id-union — worth adding an id-union merge in `useLedgerMutation` before mobile ships); mobile does not write `trips.state` at all in v1.
4. **Supabase free-tier walls.** Live location broadcast burns messages (2M/mo cap); Storage 1 GB. Fine for one family; budget Pro ($25/mo) the month real followers arrive. Not an architecture risk, a billing one.
5. **Store/platform overhead is permanent**: Apple dev account ($99/yr), annual SDK upgrades (Expo forces ~yearly), review delays on every native change (EAS Update covers JS-only changes OTA — legal per 2026 guidance).
6. **What becomes HARD later:**
   - **Retrofitting shared UI** (Tamagui/RSD) after two UI trees exist is effectively a rewrite — this option forecloses "one UI codebase" permanently in practice.
   - **The 3D globe on mobile** stays out of reach; if the globe turns out to be the product's identity, mobile will always feel lesser.
   - **Full offline-first planning on mobile** would eventually force the document→normalized-tables migration ARCHITECTURE.md deferred, plus a sync engine — nothing here blocks it, but nothing here does it either.
   - **Team scaling**: fine to 2–3 devs; a larger org would want the UI-sharing bet re-evaluated.

Compared to the alternatives this option trades ~2 extra weeks upfront (M0) and permanent dual-UI cost for: native-quality LIVE features (camera, background location, push — the pillars 3/5 essence), an SEO-capable public web (pillar 4), and zero risk to the working web app.

## 6. Business-model fit

- **Free follower loop is the growth engine**: followers (family) onboard via share link → some become planners. The mobile follower app is free and lightweight; the web planner is where premium lands. This option uniquely serves that funnel: store-app push notifications are what make following sticky, and only real native (not PWA-on-iOS with its manual-install push gate) delivers them reliably to Hungarian parents' iPhones.
- **Premium candidates map to the architecture cleanly**: multiple trips / >N collaborators (already gated by `trip_members` RLS), bank import (Enable Banking, server-side only), video (Mux costs are per-use → natural paid feature), flight tracking (metered API → paid). All are Edge-Function/RLS gates, no client rework.
- **Community data is the long-term moat** (per the integrations research: user-submitted spend + ratings replace Numbeo/Google Places you can't afford) — and `trip_events.visibility` is the single switch that turns private trip logs into that dataset.
- **Cost floor**: Vercel free + Supabase free through M2; ~$25–35/mo (Supabase Pro + Apple fee amortized) from M3; integrations chosen in §3.4 are all free-tier. Compatible with "side business, tiny budget".
- Weakest fit: if the owner's real ambition collapses to "just us + family, no platform", the monorepo overhead of M0 and the Expo app's store maintenance are over-engineering — a share-link web page (M2 alone) would suffice. The option is justified by pillars 3–6 being genuine.

---

### Critical Files for Implementation
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/trips/queries.ts (the client-injection seam the whole extraction hinges on)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/trips/useTripMutation.ts (optimistic-write pattern to port into @anp/data; needs SupabaseProvider + ledger id-union merge)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/trips/types.ts (domain contract shared by every package and both apps; Stay needs a cancellation-deadline field)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/supabase/migrations/03-catalogue.sql (pattern for migrations 06+: RLS style, is_admin(), trigger conventions)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/supabase/client.ts (stays web-local; its mobile counterpart + provider context is the first new file written)