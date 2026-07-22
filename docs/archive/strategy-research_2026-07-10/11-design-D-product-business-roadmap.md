# STRATEGIC OPTION: Product & Business Roadmap — "The Trip Is the Deadline"

Design premise: the framework question is deliberately parked. This option optimizes the **product sequence** — what to build, in what order, on what data model — so that (a) the owner's own multi-month Asia trip (the dogfood, departing within months of July 2026) is fully served, and (b) every artifact built for that trip becomes the seed of the community platform rather than throwaway code. The web app in `product/` is evolved in place.

---

## 1. Architecture & repo structure

Stay in the existing repo and app. No monorepo split, no mobile port in this option — those are separable later decisions. The structural move is **inside** the app and the database: separate the three data regimes that the vision actually contains.

**Three data regimes (the core architectural decision):**

| Regime | Nature | Storage | Sync model |
|---|---|---|---|
| **The Plan** (stops, stays, transport, extras, budget) | Private, low-concurrency (2 editors), document-shaped | Keep `trips.state` / `trips.ledger` jsonb — unchanged | Last-write-wins, as today |
| **The Lived Trip** (check-ins, ratings, comments, location pings, media, "we arrived") | Append-only events, never edited concurrently, needs realtime fan-out | **New relational tables** (`trip_events`, `check_ins`, `media`) | Insert-only → Supabase Realtime Postgres Changes; no merge problem by construction |
| **The World** (places, aggregated ratings, costs, weather, hazards, FX) | Shared/public, admin- or community-written | Existing catalogue (`countries`, `cities`, `catalogue_fields`) + new `places` | Cached server-side via crons; eventually anon-readable |

This dissolves the "jsonb vs relational" migration question: the plan document is **never migrated** (the normalized `segments`/`stays`/`transport` tables drafted in `supabase/schema.sql:54-113` stay unused and can be dropped); everything social/live is born relational. The bridge between regimes is a `place_id` written *into* the jsonb entities (a segment or stay gains an optional `placeId` field in `TripState` — a types-only change in `product/src/lib/trips/types.ts`), so plan items can point at world data without normalizing the plan.

**Repo structure (concrete, evolving `product/`):**

```
asia-nomad-planner/
  product/
    src/
      app/
        (app)/…                      # existing 6 sections, polished in M0
        (app)/live/                  # NEW: "today" screen — check-in, log, plan-vs-actual
        follow/[token]/              # NEW: PUBLIC route group (no auth guard) — family follow page
        p/[country]/[place]/         # NEW (M4): public SEO place pages
        api/cron/                    # NEW: Vercel cron routes (fx-rates, safety-feeds, weather-cache, stay-deadline-notify)
      lib/
        trips/                       # existing plan domain — untouched core
        catalogue/                   # existing
        live/                        # NEW: trip_events/check_ins queries+hooks, realtime channel helpers
        share/                       # NEW: token-share RPC client, follow-page read model
        media/                       # NEW: upload to Supabase Storage, Cloudflare Images URL builder
        integrations/                # NEW: frankfurter.ts, openmeteo.ts, gdacs.ts, aerodatabox.ts (server-only)
      components/
        live/  follow/  media/       # NEW component families
  supabase/
    migrations/
      06-multi-trip-and-onboarding.sql   # trip switcher, drop "newest row = active" assumption
      07-places.sql                       # places table + seed from cities/landmarks jsonb
      08-trip-events.sql                  # trip_events, check_ins, RLS
      09-share-links.sql                  # trip_shares + SECURITY DEFINER RPCs
      10-media.sql                        # media table + storage buckets/policies
      11-public-catalogue.sql             # (M4) anon read policies, reviews, follows, moderation
```

Server-side work that doesn't exist today: Vercel Cron (or Supabase pg_cron + Edge Functions) for FX/weather/safety caching and the stay-cancellation-deadline notifier; one Edge Function for share-token reads if not done via RPC. Still zero servers to operate.

---

## 2. Reused vs rewritten (real files)

**Reused unchanged (the domain core — ~690 lines, per code map Bucket A/B):**
- `product/src/lib/trips/types.ts`, `budget.ts`, `format.ts`, `defaultState.ts`, `keys.ts` — all budget math and the state shape survive every phase.
- `product/src/lib/trips/queries.ts` — reused, **except `fetchActiveTrip`** (see rewritten).
- `product/src/lib/trips/useTripMutation.ts`, `useLedgerMutation.ts`, `useTripScreen.ts` — the optimistic-write machinery is exactly right for the plan regime; the live regime gets parallel hooks in `lib/live/` following the same pattern.
- `product/src/lib/catalogue/*` (types, queries, `getAtJsonPath.ts`) and `components/catalogue/*` (`CityCard.tsx`, `FieldRenderer.tsx`, `renderers/`) — the metadata-driven renderer is the single biggest asset for M4: public place pages reuse `FieldRenderer` verbatim, because `catalogue_fields` already makes "add a field = DB change".
- `components/trips/Modal.tsx`, `Tabs.tsx`, `Stat.tsx`, `SaveError.tsx` — shared UI primitives.
- `components/Globe.tsx` + `lib/map/globeData.ts` transforms — the globe carries the follow page's "where are they now" view with a new live-position layer (a `ringsData` patch effect, same pattern as existing hazard patching).
- All of `supabase/migrations/01-05` and the invite/member RLS machinery (`can_access_trip`, `has_pending_invite`, `trip_invites`, `trip_members`) — family-with-accounts sharing already exists at the DB layer; M2 merely builds UI for it (Settings "who can view" count is a `trip_members` SELECT).

**Rewritten / retired:**
- `fetchActiveTrip` in `product/src/lib/trips/queries.ts` — the "active trip = newest RLS-visible row" rule is the single most vision-hostile line in the codebase (breaks the moment a family member accepts an invite or a second trip exists). Replace in M0 with an explicit trip list + selected-trip id (profile column or localStorage), i.e., re-implement what the static app's `js/cloud.js` trip switcher already had.
- `Math.random()` ids in `SegmentForm.tsx`/`StayForm.tsx`/`TransportForm.tsx`/`ExtraForm.tsx` → `crypto.randomUUID()` (trivial, do in M0 while touching forms anyway).
- `createTrip` seeding `makeDefaultState()` (the owner's Asia route) → onboarding wizard seeding an *empty* trip from basics (trip name, start date, optional end, travellers, budget cap — exactly the owner's Settings note). `defaultState.ts` stays as the owner's own data, not the template.
- Theming: `globals.css` OS-only dark mode → class-strategy toggle + accent-color CSS vars; `regColor` hardcodes in `format.ts` become var-driven. Destination palettes = a `palettes` jsonb on `cities` or a static map — cheap, high-delight, fits the existing catalogue pattern.
- Root static app (`index.html` + `js/*.js`): formally frozen. It has already been mined (invite flow → migrations 02; trip switcher → M0 spec; state shape → `types.ts`).
- `docs/ARCHITECTURE.md` Phase 2 ("move off the JSON blob to normalized tables") — **explicitly rescinded** by this option; the doc should be updated to the three-regime model.

---

## 3. How the vision's pillars land

### 3a. Live check-ins / ratings / comments (LIVE mode)
New tables (migration 08):

```sql
places (id uuid pk, kind text check (kind in ('city','attraction','restaurant','stay','custom')),
        name, country references countries(code), city_id references cities(id) null,
        lat, lng, source text ('catalogue','osm','foursquare','user'), external_ref text,
        attributes jsonb, created_by uuid null, status text default 'private')  -- private|pending|public

trip_events (id uuid pk, trip_id references trips, author uuid, at timestamptz,
             type text check (type in ('checkin','note','arrived','departed','location','media','expense_hint')),
             place_id references places null, lat, lng, payload jsonb, created_at)

check_ins (event_id pk references trip_events, place_id not null, rating smallint check (1..5),
           comment text, visited_at date)
```

Seeding `places`: the catalogue's `cities.attributes.landmarks` arrays (37 cities' worth) are exploded into `places` rows by a migration script — the owner's curated landmark data becomes the first check-in-able venue set. On the road, "check in somewhere not in the list" creates a `kind='restaurant'|'custom'`, `status='private'`, `created_by=me` place — **this is the community-data acquisition loop running from day one, private until M4.**

RLS: `trip_events`/`check_ins` = `can_access_trip(trip_id)` for all ops (reuses the existing SECURITY DEFINER function from `schema.sql:177`). `places`: select where `status='public'` (to authenticated) OR `created_by = auth.uid()`; insert by any authenticated user with `status='private'`; only `is_admin()` flips status.

UI: a `/live` "today" screen (only screen that matters on a phone during the trip): current stop from the plan, one-tap check-in (nearby places by distance), rating stars, comment, photo attach; below it the actual-trip timeline interleaved with the plan (plan-vs-actual is a pure client join of `state.segments` × `trip_events` — reuses `nightsBetween`/`segNights` from `format.ts`).

### 3b. Family follow (realtime) — the flagship of this option
Two access modes, both needed:
1. **Account-based** (already in DB): `trip_invites` role `viewer` — but M2 must actually enforce read-only (today `trips_update` RLS allows any member; tighten to `role='editor'`).
2. **Tokenized no-account link** (net-new, migration 09) — parents will not do magic-link auth:

```sql
trip_shares (token text pk default encode(gen_random_bytes(16),'hex'), trip_id, created_by,
             scope text check (scope in ('follow','full')) default 'follow',
             revoked bool default false, created_at)
```

RLS stays fully closed to `anon`. Access goes through SECURITY DEFINER RPCs granted to `anon`: `shared_trip_summary(token)` (trip name, route, current stop — a *projection* of `trips.state`, never the raw doc: strips prices, budget, ledger), `shared_feed(token, before)` (events + check-ins + media URLs), `shared_position(token)`. This keeps the "public read of private data" blast radius to three auditable functions instead of policy sprawl.

Realtime: `/follow/[token]` page subscribes to (a) **Broadcast** channel `trip:{id}:pos` for location pings from the travellers' `/live` screen (browser geolocation, throttled to 1 ping / 5–10 min — Broadcast, not DB writes, exactly as the realtime research prescribes), and (b) **Postgres Changes** on `trip_events` for the feed. Free-tier limits (200 concurrent, 2M msgs/mo) are laughably sufficient for one family; the architecture is already the right one for 10k users on Pro. Realtime auth for anon on a private channel: mint the channel access via the RPC (return a short-lived signed channel name) — small but real design task.

The follow page reuses `Globe.tsx` with a "current position" ring + the route arcs already built by `buildArcs` in `lib/map/globeData.ts`.

### 3c. Media (photos / video)
Migration 10 + Storage:

```sql
media (id uuid pk, trip_id, event_id references trip_events null, author,
       kind text ('photo','video'), storage_path text, mux_asset_id text null,
       width, height, duration_s, status text ('uploaded','ready','blocked'), created_at)
```

- **Photos:** Supabase Storage bucket `trip-media`, path `trip_id/event_id/uuid.jpg`, RLS storage policies mirroring `can_access_trip`. Delivery through Cloudflare Images remote transforms (or Supabase's built-in image transform on Pro) so the follow page never serves originals. Free tier (1 GB) forces Supabase Pro ($25/mo) roughly when the trip starts — this is the first real infrastructure cost and it's acceptable.
- **Video:** Mux free tier (10 videos / 100k delivery min/mo) for the "videos of ourselves" wish — direct upload from client, webhook (a `/api/mux-webhook` route) flips `status='ready'`. Do NOT serve raw video from Storage.
- **Moderation:** while media is private/family-scoped (M3), moderation = the share-scope itself. The moment media becomes public (M4+), add: upload size/count caps, a `reports` table, and Mux/Cloudflare's built-in signed URLs. Defer ML moderation until there are strangers.

### 3d. Community / public data (the platform turn)
M4, only after the trip has generated real check-ins. Sequence:
1. **Open the catalogue to `anon`** (today `to authenticated` — a deliberate anti-scraping choice in migration 03 that must be consciously reversed for SEO). Public place pages `/p/thailand/bangkok` render `CityCard`/`FieldRenderer` from the same `catalogue_fields` metadata — near-zero new rendering code, real SEO surface (and the reason to keep Next.js regardless of any future mobile decision).
2. **Promote user places & reviews:** `reviews` = check-ins with `visibility='public'` (add column, default private; the traveller chooses per check-in or per trip). Aggregates via a materialized view `place_stats (place_id, avg_rating, review_count)` refreshed by cron. Moderation queue = `places.status='pending'` + `is_admin()` approval — the exact admin-gating pattern migration 03 already established.
3. **Follows/social graph:** `follows (follower uuid, followee uuid)` + public profile pages. Honest assessment: this is the *last* pillar to build and the first to cut — a two-person team should treat "social network" as an aggregation of share links until there are >100 active travellers.

### 3e. Integrations (mapped to the API research, honestly triaged)

| Wish | Verdict | When | How |
|---|---|---|---|
| FX watcher | **Yes, trivial** | M0 | Frankfurter daily cron → cache into a `fx_rates` table; `state.rates` gets a "refresh from live" button. Free, no key. |
| Weather forecast | **Yes** | M1 | Open-Meteo per-stop 7-day forecast, cached per city per day in a `weather_cache` table (non-commercial tier fine until monetization). |
| Disaster/safety watcher | **Yes** | M1–M2 | GDACS JSON + FCDO Content API + State Dept RSS via cron → `safety_snapshots` table → globe hazard layer (extends the existing USGS pattern in `Globe.tsx`) + country panels. All free. |
| Stay cancellation push | **Yes — highest personal value** | M0–M1 | Data already in `state.stays` (charge/cancel dates). Cron scans trips, sends email (Resend free tier) + Web Push. This is the owner's most concrete pain; needs no external API. |
| Flight status ("FlightRadar") | **Partial** | M2–M3 | AeroDataBox (600 free units/mo) status for booked `transport` legs + a deep link to FlightRadar24 web for the live map. Do NOT buy FR24 API credits. |
| Attractions suggestion DB | **Yes, phased** | M1 seed / M4 expand | M1: own catalogue landmarks → `places`. M4: OSM/Wikidata import per country + Foursquare (10k free calls) for check-in venue search. |
| Visa/regulation watcher | **Curate, don't integrate** | M1-lite | No affordable API exists (sherpa° is revenue-share/gated). Keep the curated `countries.visa` field + FCDO links; add a Passport-Index-derived matrix table later. Show "verify officially" disclaimer. |
| Bank sync (PSD2) | **Defer hard — the trap** | M5+ / maybe never | Serving *other users'* bank data means AISP-land (licensing or a sponsoring aggregator; Enable Banking full production = contract + KYB). For the owners themselves: Enable Banking Restricted Production or the Revolut/Wise personal APIs feeding `trips.ledger` is a fine *personal* M5 experiment. Interim 80% win, M1: **auto-import stay+transport costs already in the plan into the ledger** (pure client code over existing jsonb — the owner explicitly asked for this and it needs no bank at all). |
| Daily living-cost watcher | **Curate + harvest** | M4 | Numbeo at $260/mo is out. Own catalogue tiers now; harvested user-spend (check-ins + ledger categories) becomes the moat later. |
| Landmark info links | **Yes, trivial** | M1 | `places.attributes.official_url` — a catalogue_fields row. |

---## 4. Phased milestones (1 skilled dev + Claude Code, person-weeks)

Deadline anchor: assume departure ~Oct 2026 → ~12 working weeks of part-time capacity before the trip. M0–M2 must ship before departure; M3 can partially ship from the road; M4–M5 are post-trip.

**M0 — Planner polish + multi-trip + onboarding (3–4 pw)** *[pre-trip, must-have]*
The owner's notes list, mapped: dashboard 2×2 stat blocks + progress bar + "cheat sheet" rename/centering + Next Stop emphasis (`DashboardClient.tsx`); timeline Gantt kept + filters (in-plan/country/dates/tier) + grouping (`StopsTab.tsx`); stays chronological + decluttered card (`StaysTab.tsx`); transport collapsed-row + type filter (`TransportTab.tsx`); budget two views (`BudgetTab.tsx`); monthly simplification + cross-page amount provenance (`MonthlyTab.tsx`); knowledge starts empty with country filter (`KnowledgeClient.tsx`); auto-import stay/flight costs into ledger (pure `budget.ts`-adjacent function). Structural: kill `fetchActiveTrip` newest-row rule → trip switcher; onboarding wizard (trip basics) replacing sample-trip seeding; theme toggle + accent palettes; `crypto.randomUUID()`; map day/night timezone fix. Exit criterion: girlfriend plans a weekend trip from scratch without the owner explaining anything.

**M1 — Live layer + cheap integrations (3 pw)** *[pre-trip, must-have]*
Migrations 07–08 (`places` seeded from landmarks, `trip_events`, `check_ins`); `/live` screen (check-in, rate, comment, note, arrived); plan-vs-actual timeline; FX cron; weather cache + per-stop forecast; stay-cancellation email/push notifier; safety feeds cron. Exit criterion: owner can check in to a Budapest restaurant tonight and see it on the timeline.

**M2 — Family follow (2–3 pw)** *[pre-trip, the demo that matters]*
Migration 09 (`trip_shares` + anon RPCs); `/follow/[token]` page: globe with live position, current stop, feed; Realtime (Broadcast for position, Postgres Changes for feed); viewer-role RLS tightening; Settings sharing UI with member count. Exit criterion: owner's mother opens a link on her phone, sees where they are, no account.

**M3 — Media (2–3 pw)** *[straddles departure]*
Storage bucket + policies, photo upload from `/live`, Cloudflare Images delivery, media in follow feed; Mux video upload + webhook; Supabase Pro upgrade. Exit criterion: photo taken in Bangkok appears on the family follow page within a minute.

**M4 — Community/public (4–6 pw)** *[on/after the trip]*
Anon catalogue read + public place pages (SEO); public check-in opt-in + `reviews` visibility; `place_stats` aggregates; OSM/Wikidata/Foursquare place expansion; moderation queue; public trip pages (opt-in journal); basic profiles/follows. Exit criterion: a stranger googles "Hoi An travel costs", lands on a place page showing the couple's real ratings.

**M5 — Monetization + heavy integrations (3–4 pw, demand-driven)**
Stripe + free/premium gate; affiliate link plumbing (see §6); flight-status alerts (AeroDataBox paid tier if needed); personal bank import experiment (Enable Banking restricted); destination palette store.

Total to full vision: ~17–23 pw. Total to "own trip fully served + family following": ~8–10 pw — tight but feasible by October.

---

## 5. Risks & failure modes; what this option makes HARD later

1. **The plan document stays LWW forever.** Two editors on the same trip on a patchy connection *will* occasionally clobber each other's plan edits (already documented as a known limit in `DATABASE.md`). This option accepts that for the plan regime (2 editors, low frequency) and eliminates it for the live regime (append-only). **Hard later:** real-time collaborative plan editing for teams/groups — would require the normalized-tables migration this option rescinds, or a jsonb-patch/CRDT layer. If "group trip planning" ever becomes the product, that's a re-architecture.
2. **Single-app web-only bet.** No mobile-native work in any phase. The `/live` screen is used on a phone in Asia — as a PWA/browser page with browser geolocation and Web Push (iOS: only if added to Home Screen; EU DMA status fluid). **Failure mode:** live mode feels janky on iOS Safari mid-trip with no time to fix. Mitigation: test `/live` as installed PWA on the owner's actual phone in M1, not M3. **Hard later:** the 75–80% web-bound code share (code map §4) doesn't shrink in this option; a future native app still costs the full Bucket-D rewrite.
3. **Anon RPC share links.** Token leak = strangers watch the family's live location. Mitigations are cheap (revocable tokens, coarse position option, expiry) but must be in the M2 spec, not an afterthought.
4. **Opening the catalogue to anon (M4)** reverses a deliberate anti-scraping stance and turns the couple's curated data into free training data for competitors. Accept it — SEO is the only free acquisition channel this project will ever have — but keep premium fields (live costs, aggregates) behind auth.
5. **Free-tier cliffs stack up around M3:** Supabase Pro ($25/mo) for storage/realtime, possibly Vercel Pro, Mux beyond free. Budget ~$30–60/mo from departure. Trivial in absolute terms, but it's the moment the side project stops being free.
6. **Realtime + cron are the first genuinely new engineering domains** for this codebase (everything so far is request/response + RLS). Underestimation risk in M2; the mitigation is scope discipline: position pings via Broadcast only, feed via one Postgres Changes subscription, nothing fancier.
7. **The community phase can find zero community.** Honest failure mode: M4 ships, nobody comes, and the couple owns a beautiful two-user diary. This option deliberately structures M0–M3 so that outcome is still a *win* (the trip was served); M4 spend is gated on the trip actually producing >200 check-ins and the follow page getting organic non-family visits.

---

## 6. Business-model fit

Compared models for a 2-person side project whose own trip is the deadline:

- **Affiliate (booking/flights) — first, and fits the data model natively.** `Stay.url` and `TransportLeg.url` already exist in `types.ts`; stays cards already link to platforms. Converting these to Booking.com/Agoda/12Go/Klook affiliate deep links (plus affiliate links on public place pages' "book a stay here" in M4) is days of work, zero UX degradation, zero pricing pressure on the two real users. Realistic revenue: beer money until place pages rank — which is fine; it establishes the plumbing.
- **Freemium subscription — second, gated on M4 traction.** The free/paid line writes itself from the phase structure: free = 1 active trip, planning, follow link, limited photo storage; premium (~€4–6/mo) = unlimited trips, video, flight-status alerts, weather/safety notifications, bank import, destination palette packs, family push digests. Do not build Stripe before there are ≥50 weekly-active non-family users; the `trips`-centric schema makes per-plan gating easy whenever it comes.
- **Free + premium integrations — folds into freemium**, not a separate model: the expensive integrations (AeroDataBox paid tiers, bank sync, future Numbeo) are exactly the premium features, so their API costs are covered by the users who trigger them.
- **Rejected for now:** ads (kills the family-diary intimacy that is the product's soul), sherpa°-style revenue-share visa sales (needs volume), selling the community data (needs a community).

**Sequencing:** M0–M3 free and unmonetized (the trip is the ROI) → M4 + affiliate links (passive, SEO-driven) → M5 Stripe freemium once retention exists. The strategic asset this roadmap compounds is the **data moat**: every check-in, rating, real spend, and stay decision from real trips feeds `places`/`place_stats` — the thing Numbeo charges $260/mo for, harvested for free as a by-product of dogfooding.

---

### Critical Files for Implementation
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/trips/queries.ts (kill the newest-row "active trip" rule; the multi-trip pivot everything depends on)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/trips/types.ts (plan-document schema: `placeId` bridge fields, visibility flags)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/supabase/migrations/03-catalogue.sql (the RLS/admin/catalogue patterns every new migration 06–11 extends)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/components/catalogue/FieldRenderer.tsx (metadata-driven renderer reused for public place pages in M4)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/components/Globe.tsx (live-position layer for the family follow page; hazard-feed extension pattern)