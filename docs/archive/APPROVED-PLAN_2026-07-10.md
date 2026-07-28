# Asia Nomad Trip Planner → Trip Planner + Live Trip Follower

> ⚠️ **PARTIALLY SUPERSEDED (2026-07-28).** The mobile strategy in §"Decisions made" and
> §P1–P2 below has changed: **the Expo companion app is dropped**. Android ships as a
> **Trusted Web Activity** over the PWA; iOS ships as a **native SwiftUI app**; both are
> targeted *before* departure rather than post-trip. React Native and NativeWind are out of
> the roadmap. Everything else here — the three data regimes, milestones M0–M4, the
> mock-first design gate, the security ordering — still stands.
> See **[`../PLATFORM-DECISION_2026-07-28.md`](../PLATFORM-DECISION_2026-07-28.md)**.

## Context

The repo at `/Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner` contains a working Next.js 16 + React 19 + Supabase trip-planner (`product/`) that fully replaced the original static app. The owner wants to evolve it into a **trip planner + live trip follower**: real-time check-ins with ratings/comments, a way for family to follow the trip live (no account needed), photo/video sharing, and — later — public community data and light monetization.

**Hard constraint:** the owner + girlfriend depart **Budapest → Bangkok on Aug 31, 2026** (~7 weeks from July 10), with a Bangkok apartment for September; the route after that is still evolving. The trip is both the deadline and the dogfood. Breaking the working app is unacceptable.

**Decisions made (user-confirmed):**
- **Architecture: hybrid, phased.** Pre-trip: evolve the existing Next.js app in place (PWA). Post-departure: extract shared packages into a monorepo and add an Expo native companion app. No framework rewrite before the trip. Expo-only web was rejected (second-class SEO in 2026); full UI-sharing (Tamagui/RSD) rejected (wrong bet for a 1-dev team).
- **Usability-first process:** before implementation, produce **detailed endframe mocks of every screen in every role/state** (owner planning, traveller live, co-editor, follower, admin, empty/offline/error) so completeness is validated visually. Implementation builds toward approved endframes.
- **Sequencing: live mode + family follow ship before UI polish.** Polish notes are *designed* in the mocks up front but *implemented* partly from the road (it's a website).
- **Capacity: near full-time (30h+/wk)** until departure.
- **Business: log the trip, spread the word; monetization features added opportunistically.** This app joins the "Keep Your Habits" product family as a subunit. **Full financial management is a separate future app** — here, costs stay simple inputs (ledger as-is); no bank sync in this app. Apps interconnect later.

## Core data-model decision: three regimes

1. **The Plan** (stops/stays/transport/extras/budget): stays in `trips.state` / `trips.ledger` jsonb, last-write-wins. Never migrate the blob. The dormant normalized itinerary tables in `supabase/schema.sql:54-113` stay unused; rescind the "Phase 2 normalization" section of `docs/ARCHITECTURE.md`.
2. **The Lived Trip** (check-ins, ratings, comments, positions, media): **born relational, append-only** — new tables `places`, `trip_events`, `check_ins`, `media`, `trip_shares`. No merge conflicts by construction; realtime- and RLS-friendly; each public check-in later becomes a community review.
3. **The World** (catalogue, FX, weather, safety): existing `countries`/`cities`/`catalogue_fields` + new server-cached tables filled by cron.

Bridge: plan entities gain an optional `placeId` (types-only change in `product/src/lib/trips/types.ts`).

## Pre-trip milestones (trip-ready gate: ~Aug 22, 1-week buffer)

### M0 — UX blueprint: endframe mocks (week 1) — THE DESIGN GATE

Deliverable: a self-contained **HTML mock kit** in `design/mocks/` (plain HTML + Tailwind, no build step, openable in a browser / shareable as an artifact) — the endframes we build toward. One page per screen with a **state switcher** (role × trip-phase × data-state), plus a coverage-matrix doc (`design/SCREENS.md`) enumerating every screen×state so gaps are visible.

Screens × states to mock (desktop + phone viewport for each — trip usage is phone-first):
1. **Sign-in & onboarding** — new user, returning user, invited co-editor accepting, onboarding wizard (trip name, start date, optional end, travellers, budget cap).
2. **Dashboard** — planning phase vs live-trip phase (plan-vs-actual), empty state (no trip yet). Includes the owner's notes: 2×2 stat blocks + progress bar emphasis, "cheat sheet" rename/centering, Next Stop emphasis.
3. **Itinerary (Stops/Stays/Transport/Extras)** — editor view vs read-only viewer; owner's notes designed in: timeline table + filters + country grouping, stays chronological/decluttered (name, location, price, charge date), transport collapsed-route rows + type filter.
4. **Money (Budget/Monthly/Ledger)** — budget 2-view, monthly optional/simplified, ledger with auto-imported plan costs; costs-as-simple-inputs (per product-family decision).
5. **Map** — planning view; live view with position ring + "last seen"; timezone setting; lite/2D fallback.
6. **`/live` today screen** — the traveller's phone screen: check-in flow (place pick → rate → comment → photo), arrived/note actions, plan-vs-actual timeline, **offline state** (queued check-in badge), error states.
7. **Follow page** (`/follow/[token]`) — follower with no account: globe + last seen, feed with photos, notify-me opt-in; revoked/expired-link state; "content hidden" (private) state.
8. **Explore/Knowledge** — starts-empty + country filter, own-notes badges; user vs **admin state** (add city/field, edit values).
9. **Settings** — trip meta + FX, sharing panel (share links create/revoke, follower count, co-editor invites), theme toggle + accent/destination palettes.
10. **Later-phase endframes (design now, build later):** public place page `/p/[country]/[place]`, public trip journal, Expo companion app's 4 tabs (Today/Map/Feed/Money), moderation queue.

Gate: owner reviews the kit, walks every state, and signs off (or amends) — **no schema/UI implementation for a screen before its endframe is approved.** Mocks double as the acceptance criteria for M1–M4.

Runs in parallel during week 1 (UI-independent, so no calendar loss): the backend safety work of M1 items 1–4 below.

### M1 — Safety & structure (weeks 2–3)

Ordering is deliberate: these close data-loss and security holes **before** any new writers/features are added.

1. **Disarm the static fallback app's writer**: `js/cloud.js:79-82` (`cloudPush`) updates `state`+`ledger` together, bypassing every safeguard. Make it read-only (or remove its Supabase config). ~1 hour, do first.
2. **Security migration 06** (verified holes in `supabase/schema.sql` + `migrations/02-invites.sql`):
   - Split `can_access_trip()` (role-blind, `schema.sql:177`) into `can_edit_trip()` (owner/editor) vs `can_view_trip()`.
   - Rewrite `trips_update` (`schema.sql:210-214`) with proper `USING`/`WITH CHECK`; freeze the `owner` column with a trigger (mirror `guard_profile_admin_flag` in `03-catalogue.sql`).
   - Constrain `members_insert` self-inserts to the invite's role (today any invitee can self-escalate to editor).
   - Pin `set search_path = public` on all SECURITY DEFINER functions.
   - Profiles: add a member/follower-visible `display_name` surface (today `profiles_select` is self-or-admin only — breaks any feed).
3. **Write-guard on the document model**: per-column integer revisions (`state_rev`, `ledger_rev`) checked in `writeState`/`writeLedger` (`product/src/lib/trips/queries.ts`) with conflict toast + refetch. Do NOT use `updated_at` equality (shared column, client clock — breaks column independence).
4. **Ledger server-side merge**: replace whole-array LWW writes from `useLedgerMutation` with an RPC that appends/removes by id in one SQL statement. (Money edits from two phones are the most likely conflict on this trip.)
5. **Multi-trip**: kill `fetchActiveTrip` "newest visible row" rule. Parameterize `tk.activeTrip` → `tk.trip(id)` (touches `useTripScreen`, `useTripMutation`, `useLedgerMutation`, `prefetch.ts`, `SettingsClient`, `map/page.tsx`, `CreateTripEmptyState` — 8+ files). Persist selected trip in a **cookie** (server prefetch must read it; localStorage can't). Add trip switcher UI.
6. **Onboarding wizard**: new trips seed from basics (name, start date, optional end, travellers, budget cap — the owner's Settings note) instead of `makeDefaultState()`, which currently copies the owner's **real booking confirmation numbers** into every new trip (privacy leak). `defaultState.ts` remains only as the owner's own trip data.
7. Small fixes while touching forms: `Math.random()` ids → `crypto.randomUUID()` (SegmentForm, StayForm, TransportForm, ExtraForm, LedgerTab); add `cancelUntil`/`chargeDate` to `Stay` type + StayForm.
8. **Stay-deadline alerts, email-first** (Resend free tier): Supabase pg_cron + Edge Function scanning stays' `cancelUntil`. (Web Push comes in M3; email works on day one.)

### M2 — Live mode (weeks 4–5)

1. **Migrations 07–08**: `places` (seeded by exploding the catalogue's 46 cities' `attributes.landmarks` jsonb into rows; batch-geocode via Wikidata/Nominatim — landmarks currently have no lat/lng), `trip_events` (append-only: checkin/note/arrived/media/location kinds, payload jsonb, visibility `trip|followers|public` default `trip`), `check_ins` (rating 1–5, comment). RLS: writes gated by `can_edit_trip`; reads by `can_view_trip`.
2. **`/live` "today" screen** (new route in `(app)`): current stop from plan, one-tap check-in (city-scoped place list + "add place here" with phone GPS), star rating, comment, photo attach; plan-vs-actual timeline below (client join of `state.segments` × `trip_events`, reusing `nightsBetween`/`segNights` from `format.ts`).
3. **Offline outbox for check-ins**: client-generated UUIDs, idempotent inserts, TanStack persisted mutations + IndexedDB persister. Check-ins are the only offline write — plan editing offline is explicitly out of scope. Acceptance test: airplane-mode check-in syncs later.
4. **PWA baseline**: `manifest.ts` + Serwist service worker + install on both owners' phones. Test on the actual iPhone in M2, not later.
5. **Auto-import planned costs into ledger** (owner's note): pure client function copying booked stay/transport costs as ledger suggestions. No bank APIs — ever, in this app (future finance app's job).

### M3 — Family follow + media (weeks 5–6)

1. **Migration 09 — share links**: `trip_shares` (random token hashed at rest, scope `follow`, revocable, default expiry) + **sanitized SECURITY DEFINER RPCs** granted to `anon`: `shared_trip_summary(token)` (name, route cities/dates/coords via definer join — catalogue is auth-only, so the RPC must return coords itself), `shared_feed(token, before)`, `shared_position(token)`. **Never return raw `state`/`ledger`** (contains confirmation numbers, prices, private notes). Rate-limit against token enumeration.
2. **`/follow/[token]` public page** (no auth guard): globe with route + last-known-position ring (reuse `Globe.tsx` via a props-only wrapper decoupled from `useTripScreen`), current stop, event feed with photos.
   - **Feed updates: poll the RPC every 30–60s.** (Postgres Changes cannot reach anon subscribers under closed RLS — verified; don't build it.)
   - **Position: Supabase Realtime Broadcast** on a share-code-scoped **private** channel (channel auth via `realtime.messages` RLS), published from `/live` while foregrounded, throttled. Frame the UI as event-driven "last seen: Hoi An, 2h ago" — iOS PWAs cannot background-track, and that's fine for this product.
3. **Media (photos)**: Supabase Storage bucket `trip-media` (RLS mirrors trip access), client-side resize, signed GET URLs for anon followers via a Vercel route handler holding the service key (SQL RPCs can't sign storage URLs). Upgrade to Supabase Pro (~$25/mo) around departure.
4. **Web Push** (VAPID + `push_subscriptions` table + send route): deadline alerts + "X checked in" for followers who opt in; email fallback stays.
5. **Settings sharing UI**: create/revoke share links, follower count, co-editor invites (existing `trip_invites`, now role-safe).
6. Video: **defer to during-trip** (Mux free tier is only 10 stored assets total — budget Cloudflare Stream ~$5/1k min or Mux paid when it lands).

### M4 — Buffer + polish subset + cheap integrations (week 7)

- pg_cron + Edge Functions (NOT Vercel Hobby crons — 2/day limit): FX daily → `fx_rates` (use open.er-api.com class source — **Frankfurter lacks VND/KHR/etc.**), Open-Meteo weather cache per stop, GDACS+FCDO safety snapshots.
- Polish cut-list (only if green): dashboard stat emphasis + "cheat sheet" rename, stays chronological + decluttered cards, dark/light toggle (`data-theme` + CSS vars; ~220 hardcoded color utilities to sweep).
- Explicitly deferred to during-trip: destination palettes, timeline filters/grouping, transport collapsed rows + FlightRadar deep-links, budget 2-view, monthly simplification, knowledge-base UX, map timezone setting, AeroDataBox flight status.

### Ops guardrails (throughout)

- Second free Supabase project as **staging**; Supabase CLI migrations; manual dump before every prod migration; RLS assertion script run against staging for migrations 06–09.
- **Additive-only schema changes during the trip; RLS changes frozen after ~Aug 22.**
- Never put backticks in `git commit -m` (shell substitution).

## Post-departure phases (from the road / after)

- **P1 (Sept–Oct): monorepo extraction** — pnpm + Turborepo; `git mv product apps/web`; `packages/core` (types, budget math, format, defaultState, pure globeData transforms ≈540 lines move verbatim), `packages/data` (queries + hooks; they already take a `SupabaseClient` — swap direct client import for a `SupabaseProvider` context). React as peerDependency in packages (no hard root override). Metro/pnpm: `node-linker=hoisted`.
- **P2 (Oct–Dec): Expo companion app** (SDK 56+, Expo Router, NativeWind): Today / Map (MapLibre RN — flat map; the 3D globe stays web-only) / Feed / quick-expense tabs; expo-notifications push; OTP or Apple/Google sign-in (magic-link PKCE breaks across app contexts; OTP needs custom SMTP). TestFlight/internal track (builds expire in 90 days — schedule a mid-trip refresh); public store release only with moderation basics.
- **P3 (post-trip): community v0** — `public_cities` **view** for anon/SEO (never flip base-table RLS; `attributes` jsonb would leak wholesale), `/p/[country]/[place]` pages reusing `FieldRenderer`, opt-in public check-ins → reviews + `place_stats`, moderation queue via existing `is_admin()` pattern.
- **P4 (opportunistic): monetization-light** — affiliate links (Booking/Agoda/12Go/Klook) on stays/transport/place pages; Stripe freemium only if real non-family retention appears. Branding under the Keep Your Habits company family. User-submitted spend/ratings are the long-term data moat (replaces Numbeo/Google Places money).

## Critical files

- `product/src/lib/trips/queries.ts` — active-trip rule, write guards, ledger RPC call
- `product/src/lib/trips/keys.ts` + `useTripScreen/useTripMutation/useLedgerMutation/prefetch.ts` — multi-trip re-keying
- `product/src/lib/trips/types.ts` — `Stay.cancelUntil/chargeDate`, `placeId` bridges
- `product/src/lib/trips/defaultState.ts` — becomes owner-only data; onboarding replaces it
- `supabase/schema.sql` + `supabase/migrations/02-invites.sql`, `03-catalogue.sql` — RLS repair patterns; new migrations 06–10
- `product/src/components/Globe.tsx` — props-only wrapper + live-position ring for follow page
- `js/cloud.js` — disarm first
- `docs/ARCHITECTURE.md` — update to three-regime model + this roadmap

## Verification

- M0 gate: every screen×state in `design/SCREENS.md` has an approved endframe; each later milestone's UI is accepted by diffing the built screen against its mock.
- After each migration: RLS assertion script on staging (viewer cannot write; invitee cannot self-escalate; anon sees nothing except via share RPCs; RPC never returns `state`/`ledger` keys).
- M2: check-in from a phone in airplane mode → reconnect → event appears once (idempotent). PWA installed on the owner's actual iPhone.
- M3 end-to-end demo (the gate): a phone with **no account** opens the share link → sees globe + current stop + feed; a check-in with photo made on the other phone appears within ~60s; revoking the link kills access.
- Continuous: `tsc --noEmit` + `next build` green; Vercel preview deploys per PR; both owners use the app weekly on real data (a weekend-trip dogfood of `/live` before Aug 31).
