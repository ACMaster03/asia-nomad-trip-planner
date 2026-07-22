# OPTION B — Universal Expo App: One React Native Codebase for iOS / Android / Web

Design document. Repo verified at `/Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner` (domain layer confirmed: `product/src/lib` is ~603 lines of cleanly isolated TS; view layer `product/src/components` + `product/src/app` is the rewrite surface).

---

## 0. Thesis and honest framing

Bet everything on **Expo SDK 56+ (React Native 0.85, React 19.2) + Expo Router** as the single codebase. iOS and Android become first-class; web is produced by Expo Router's static rendering (react-native-web). Supabase stays exactly as-is — same project, same RLS, same jsonb document model — which is what makes a zero-downtime migration possible.

Honest core tension, stated up front: **this option trades web quality for native quality.** In 2026, Expo web is production-grade for *app-like* surfaces (X/Twitter web runs on RNW) but explicitly second-class for content/SEO sites, and react-native-web itself has entered maintenance mode (ecosystem direction is React Strict DOM, not yet safe for a small team). The vision's pillar 4 (public community data → a discoverable travel platform) is the pillar this option serves worst. Everything mobile-native — live check-ins, GPS, camera, push, family follow — it serves best. The recommendation inside this option is to accept **one pragmatic impurity**: a tiny static marketing/SEO shell (a handful of pages) alongside the Expo app, because pure Expo web will not win organic search for community content.

---

## 1. Architecture & repo structure

Monorepo (pnpm workspaces or bun; Expo has first-class monorepo support). The existing `product/` Next.js app is **kept in the tree, frozen, and running in production** until cutover (§4).

```
asia-nomad-planner/
├── apps/
│   ├── expo/                        # THE app — iOS + Android + Web
│   │   ├── app/                     # Expo Router (file-based, mirrors current IA)
│   │   │   ├── _layout.tsx          # root: QueryClientProvider, Supabase session, theme
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx        # email → 6-digit OTP (not magic link; see §5 risks)
│   │   │   │   └── verify.tsx
│   │   │   ├── (tabs)/              # native tab bar; web renders as top nav
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── itinerary/       # index + stops/stays/transport/extras
│   │   │   │   ├── money/           # budget/monthly/ledger
│   │   │   │   ├── map.tsx          # platform-split, see §3 globe story
│   │   │   │   ├── explore/         # knowledge base + [city].tsx detail
│   │   │   │   └── live/            # NEW: check-in feed, "today" view
│   │   │   ├── follow/[shareCode].tsx   # public follower view (family)
│   │   │   └── settings.tsx
│   │   ├── components/              # RN primitives, NativeWind-styled
│   │   │   ├── map/
│   │   │   │   ├── TripMap.web.tsx      # globe.gl (ported from Globe.tsx)
│   │   │   │   └── TripMap.native.tsx   # @maplibre/maplibre-react-native
│   │   │   └── ...
│   │   ├── app.json / eas.json      # EAS Build + Submit + Update config
│   │   └── metro.config.js
│   └── web-marketing/               # PRAGMATIC IMPURITY: ~5 static pages
│       │                            # (landing, pricing, /city/[slug] SEO pages)
│       │                            # Astro or minimal Next — deployed on Vercel
├── packages/
│   ├── core/                        # Bucket A — moved verbatim, zero deps
│   │   ├── trips/   types.ts, budget.ts, format.ts, defaultState.ts, keys.ts
│   │   ├── catalogue/ types.ts, keys.ts, getAtJsonPath.ts
│   │   └── map/     routeData.ts    # pure half of globeData.ts (buildRoute,
│   │                                #   buildArcs, seasonalHazards, quakesFromFeed…)
│   ├── data/                        # Buckets B+C — queries + TanStack hooks
│   │   ├── trips/queries.ts, catalogue/queries.ts        # unchanged (take SupabaseClient)
│   │   ├── hooks/ useTripScreen, useTripMutation, useLedgerMutation, useIsAdmin
│   │   ├── live/                    # NEW: checkins, follows, realtime channels
│   │   └── supabase/
│   │       ├── client.native.ts     # supabase-js + expo-secure-store/AsyncStorage
│   │       └── client.web.ts        # supabase-js + browser storage (no @supabase/ssr)
│   └── config/                      # tsconfig, eslint, shared constants
├── product/                         # FROZEN Next.js app — prod until cutover, then deleted
├── supabase/                        # migrations (additive only during trip), Edge Functions
│   └── functions/                   # fx-daily, weather-cache, hazards-cache, flight-status
└── index.html + js/                 # legacy static app — delete at M0
```

Key technology choices inside the option:

- **Styling: NativeWind v4** — Tailwind syntax over RN styles, works on all three platforms. This is deliberate: the owner's muscle memory and every existing component's design intent is expressed in Tailwind classes, so rewrites are transliterations, not redesigns. Theming (dark/light + destination palettes from the feature notes) = NativeWind CSS variables + a theme context, one implementation for all platforms.
- **Navigation: Expo Router** with `(tabs)` group → real native tab bar on iOS/Android (this alone answers most of Apple's "not a lazy wrapper" concern that kills Option-A-style apps), URL-addressable routes on web.
- **State/data: unchanged** — TanStack Query 5 + the existing optimistic-mutation pattern (`useTripMutation`'s updater-fn + scope-serialized writes ports to RN with zero changes; it's already Bucket C).
- **Auth: switch magic-link → email OTP code** (`signInWithOtp` with `shouldCreateUser`, verify via 6-digit code). Magic links on mobile mean deep-link + universal-links config and break when the email client opens the link in an in-app browser. OTP codes use the *same* Supabase flow, work identically on all three platforms, and delete `auth/callback/route.ts` + `auth/confirm/route.ts` + `proxy.ts` entirely — no server-side session machinery exists in an Expo app (no SSR → no cookie juggling → `@supabase/ssr` is simply dropped).
- **Push: expo-notifications + EAS** — needed for the stay-cancellation-deadline reminders in the feature notes and for follower engagement. This is a headline advantage over every web-based option.
- **Backend-for-integrations: Supabase Edge Functions + pg_cron** — FX (Frankfurter daily), weather (Open-Meteo), hazards (GDACS/FCDO), flight status (AeroDataBox) all get cached into Postgres tables server-side. Client-agnostic by construction, so this work is identical across all strategic options and never throwaway.

---

## 2. Reused vs rewritten (real files)

### Survives verbatim (move to `packages/core`, ~600 lines, the entire domain)
| File (under `product/src/`) | Notes |
|---|---|
| `lib/trips/types.ts` (90 ln) | Whole domain model. Untouched. |
| `lib/trips/budget.ts` (167 ln) | All money math — the app's hardest-won logic. Untouched. |
| `lib/trips/format.ts`, `defaultState.ts`, `keys.ts` | Untouched (`structuredClone` is fine on Hermes ≥ RN 0.74). |
| `lib/catalogue/types.ts`, `keys.ts`, `getAtJsonPath.ts` | Untouched. |
| `lib/map/globeData.ts` — pure half | `buildRoute`, `buildArcs`, `seasonalHazards`, `quakesFromFeed`, `COUNTRY_ALIAS`, `isoToFlag`, `quakeSafetyNote` extract cleanly; only `loadMapOpts/saveMapOpts` (localStorage) is replaced by a storage adapter. |

### Survives with trivial adaptation (move to `packages/data`, ~230 lines)
| File | Change |
|---|---|
| `lib/trips/queries.ts`, `lib/catalogue/queries.ts` | None — already take a `SupabaseClient` arg. |
| `lib/trips/useTripScreen.ts`, `useTripMutation.ts`, `useLedgerMutation.ts`, `hooks/useIsAdmin.ts` | Swap the imported client factory; logic identical. |

### Survives untouched: the entire Supabase backend
All migrations 01–05, RLS, `can_access_trip()`, `is_admin()`, invite flow, the `trips.state`/`trips.ledger` document model, the catalogue metadata system (`catalogue_fields` driving dynamic rendering — the *renderer* is rewritten but the DB-driven design carries over 1:1: `FieldRenderer`'s REGISTRY-by-`field.type` pattern is renderer-agnostic).

### Rewritten (all of it — ~2,400+ lines of view code)
- **All 16 `components/trips/*.tsx`** → RN primitives. `<table>` → `FlatList`/`FlashList` rows (this is actually a *win*: the feature notes ask for "collapsed = route only, expand for details", card-style stays, decluttered rows — mobile-first list patterns, not tables). `Modal.tsx` → RN `Modal`/bottom-sheet. `confirm()/alert()` → `Alert.alert`. Forms (`SegmentForm` etc.) → same field logic, RN inputs.
- **All 3 `components/catalogue/renderers/` + `CityCard.tsx`, `FieldRenderer.tsx`** → mechanical port (they're small, prop-driven, no DOM tricks).
- **All of `src/app/**`** → Expo Router routes; server prefetch/`HydrationBoundary`/`prefetch.ts` deleted (client-fetch + TanStack cache + AsyncStorage persister replaces it; on native there is no SSR to hydrate from).
- **`lib/supabase/client.ts`, `server.ts`, `proxy.ts`, `src/proxy.ts`, both `auth/*` route handlers** → deleted; replaced by ~40 lines of `supabase-js` + SecureStore.
- **`components/Globe.tsx`** → platform-split, see next section.

Net: **~20–25% of the codebase survives, but it's the *right* 25%** — every line of business logic, every schema decision, every RLS policy. What's rewritten is presentation, and the feature notes already demanded a substantial visual redesign of most screens anyway (Overview restructure, Timeline Gantt+filters, Stays cards, collapsed Transport, empty-state Knowledge). The rewrite and the redesign are the same work done once.

## 3. Globe / map replacement story

The 3D globe (`Globe.tsx`, globe.gl/three.js/WebGL) is the deciding technical constraint (per research: globe.gl needs a DOM canvas; three.js-on-RN via expo-gl is fragile, physical-device-only, deprecated-GL risk). The answer is a **platform split behind one component API**:

- `TripMap.web.tsx` — port `Globe.tsx` nearly as-is (globe.gl runs fine inside Expo web, which is real DOM; the `next/dynamic ssr:false` wrapper becomes unnecessary or a lazy import). Textures/geojson move from `product/public/vendor/` to the Expo web `public/` dir. The BUILD/PATCH effect structure, `ratesRef` trick, `_destructor()` cleanup all carry over.
- `TripMap.native.tsx` — **MapLibre RN** (`@maplibre/maplibre-react-native`, free tiles via OpenFreeMap): route polylines + numbered stop markers from `buildRoute`, flight arcs as GeoJSON LineStrings from `buildArcs`, hazard symbols from `seasonalHazards`/`quakesFromFeed`, tap → the ported `CountryPanel`/`HazardPanel` as bottom sheets. Globe-view styling in MapLibre GL (globe projection landed in MapLibre GL JS/native in 2024–25) gets you *most* of the wow factor without three.js.

Both consume the same pure transforms from `packages/core/map`. Accept honestly: **the "one codebase" promise has an asterisk on the map screen** — two map implementations, ~400–600 lines each, forever. USGS/monsoon data layers are shared (pure fetch + transform). This is still far cheaper and safer than a three.js/expo-gl rebuild.

## 4. Migration sequencing — the couple's trip is never broken

Ground rules that make this safe:
1. **The Next.js app in `product/` stays deployed on Vercel, untouched, as the production app for the entire migration.** Both apps point at the same Supabase project; the document model (`writeState`/`writeLedger` on separate columns) is preserved, so the Expo app and the Next.js app can be used interchangeably on the same trip from day one of M1.
2. **All schema changes are additive** (new tables: `checkins`, `follows`/share-codes, `media`, integration caches; new columns never; `trips.state` shape never changes incompatibly). The normalization plan in `docs/ARCHITECTURE.md` (move off jsonb to `segments`/`stays`/… tables) is **explicitly deferred until after the trip** — never normalize a live document mid-journey.
3. One guard added early to `writeState`/`writeLedger`: optimistic-concurrency check on `updated_at` (`.eq('updated_at', seen)`) — cheap insurance once two people on two phones edit the same doc, and it benefits the old app too.

### Milestones (effort = person-weeks for one skilled dev + Claude Code; ranges are honest)

| M | Scope | Effort |
|---|---|---|
| **M0 — Monorepo + package extraction.** pnpm workspaces; move Buckets A/B/C into `packages/core` + `packages/data`; Next.js app consumes them from the packages (proves extraction, keeps prod green); delete legacy static app; CI typecheck. | **1–1.5 pw** |
| **M1 — Expo companion app (native, read-mostly).** Expo scaffold, OTP auth, session in SecureStore, TanStack + AsyncStorage persistence (offline reads — better than the current product app), Dashboard + Itinerary read views + Ledger add-entry (the one thing you do daily while travelling). EAS internal distribution to the two of them. *The trip now has a phone app; Next.js remains primary.* | **2.5–3 pw** |
| **M2 — Live mode + family follow (the new value, native-first).** `checkins` table (place ref, rating, comment, photo, lat/lng, ts) + `trip_share` codes + RLS for viewer/anon-scoped follow; check-in flow with GPS + camera (expo-location, expo-image-picker → Supabase Storage); follower feed screen at `follow/[shareCode]` (works on Expo web too — family needs zero install); Supabase Realtime (Postgres Changes on `checkins` — low volume, free tier fine; Broadcast only if/when continuous location sharing is added); push notifications (check-in pings to followers, stay-cancellation reminders via pg_cron + Edge Function). | **3–4 pw** |
| **M3 — Map.** `TripMap.native` (MapLibre) + `TripMap.web` (globe.gl port) + panels as bottom sheets. | **2 pw** |
| **M4 — Full editing parity.** All CRUD forms, Stops Gantt/timeline, Budget/Monthly, Settings, Knowledge/Explore with country filter + notes badges, theming system (dark/light + first destination palettes). At M4 end the Expo app supersedes Next.js functionally. | **4–5 pw** |
| **M5 — Web cutover + stores.** Expo Router static web build; QA all routes on desktop web; `web-marketing` static shell (landing + a few SEO city pages reading the catalogue at build time); swap Vercel domain: marketing shell at `/`, Expo web at `app.` subdomain (or `/app`); freeze→delete `product/`; EAS Submit to App Store + Play (assets, review, privacy labels). | **2.5–3 pw** |
| **M6 — Community seed (post-trip).** Aggregate `checkins` ratings into public per-place stats (materialized view + anon-read RLS on aggregates only); place database seeded from OSM/Wikidata/Foursquare per the integrations research; moderation flags. | **3–4 pw** |

**Total to full replacement (M0–M5): ~15–18.5 person-weeks** of focused work; **M6 community: +3–4 pw**. With Claude Code doing the mechanical component transliteration (Tailwind JSX → NativeWind RN is highly automatable) the low end is realistic for M0/M1/M4; the *irreducible* time is native tooling friction (EAS, push certs, store review, MapLibre quirks, device testing) — budget it, don't hand-wave it. Calendar reality for a person with a day job: **5–7 months to M5**. Sequencing is deliberately value-first: the trip gets the phone app (M1) and the family gets live following (M2) *early*, while web parity — where a working app already exists — comes last.

## 5. How the vision's pillars land

1. **Web first, mobile later from same project** — inverted but satisfied: this option is *mobile-first from the same project*, and web never disappears (Next.js until M5, Expo web after). Fits the actual usage reality: during the trip, the phone is the primary device.
2. **Universal planner + follower** — Expo Router structure above; multi-trip support (drop the `fetchActiveTrip` "newest row = active" hack for an explicit trip switcher — small change in `packages/data`, schema already supports N trips).
3. **Live mode** — this option's home turf: GPS check-in, camera, offline queue (TanStack persister + mutation queue), push. No other option does this as well.
4. **Community/public data** — the weak pillar. Ratings/comments accumulate fine (M2/M6 schema), but *discoverability* of community content via Google is where Expo web underdelivers; the `web-marketing` static shell rendering catalogue/place pages is the mitigation, and it can grow into a proper content site later without touching the app.
5. **Family follow** — M2; Supabase Realtime is fully code-shared across all three platforms (strong fit); free tier suffices for family-scale, budget Pro ($25/mo) when live location pings start.
6. **Business model** — see §7.
7. **Integrations** (feature notes: FX, weather, visa, flight tracker, bank import) — all server-side Edge Function caches (§1), identical under any option; PSD2 bank import (Enable Banking) is a server-side integration + a review UI, platform-neutral.

## 6. Risks & failure modes; what this makes HARD later

- **The rewrite hump is real and front-loaded.** ~2,400 lines of working, polished UI get rebuilt before any new user value ships on web. If motivation dies at M3, you're left maintaining two apps. Mitigation: M1/M2 ship *new* value (mobile + live mode) before parity work starts, so even an abandoned migration leaves a useful companion app.
- **react-native-web is in maintenance mode.** The web output rides a library Meta has deprioritized in favor of React Strict Dom; Expo maintains its fork/integration, but this is a structural bet that Expo keeps web viable. Failure mode: web output quality stagnates → you end up writing a real web app later anyway (which is Option-C-shaped work done late and grudgingly).
- **SEO/content ceiling.** Expo static rendering + `generateMetadata` covers the basics, but Lighthouse-100 content pages, RSC, edge rendering are off the table. Hard later: pivoting to a content-led growth strategy (city guides, itineraries as SEO pages) inside the app codebase — that's why the marketing shell exists, but it's a second codebase in miniature.
- **Map split forever.** Two map implementations; the globe (a signature feature) never runs on native. If the 3D globe *is* the brand, this option dilutes it on the platform where users will spend the most time.
- **Native ops overhead is permanent.** EAS builds, store reviews (1–3 days per release, real rejection risk on first submission), push cert renewals, OS-version churn. One person now runs a three-platform release train. EAS Update (OTA for JS) softens but doesn't remove this.
- **Auth/session migration.** Cutover from cookie-based `@supabase/ssr` sessions to client-stored sessions logs everyone out once (fine — everyone is 2 people + family), and OTP-code UX must be validated with the actual family members (non-technical users).
- **Concurrent-edit risk grows.** Two phones + offline queues on a last-write-wins jsonb doc will eventually clobber an edit. The `updated_at` guard (§4) prevents silent loss; real merging (per-section writes or normalization) remains post-trip debt.
- **Hard later:** anything web-platform-native — rich WebGL experiences beyond the map, embeds/widgets, server-rendered personalization, web A/B tooling; also hiring (RN+Expo+NativeWind is a narrower pool than Next/React DOM).

## 7. Business-model fit

- **Good fit:** subscription SaaS via the app stores (IAP; EU DMA + external-purchase links let you steer to Stripe web checkout and dodge much of the 15–30% cut), push-driven retention (deadline alerts, follower pings — retention is where travel apps monetize), premium live-follow / media features as the paid tier, one team shipping every feature to three platforms simultaneously once past the hump. The community data moat (user-submitted spend + ratings, replacing Numbeo/Google Places costs) is schema-level and option-independent — fully preserved.
- **Poor fit:** SEO-led freemium acquisition (the classic travel-platform funnel: rank for "3 days in Hoi An" → convert to signup). That funnel needs the content site this option doesn't naturally produce; the marketing shell is the hedge, and its scope will grow with the ambition of pillar 4.
- **Cost profile:** Supabase Pro $25/mo at Realtime scale, EAS free/Starter tier initially, Apple $99/yr + Play $25 one-time, MapLibre/OpenFreeMap $0, integrations ~$0–10/mo per the API research. Compatible with the tiny-budget constraint.

**Bottom line for the orchestrator:** Option B maximizes pillars 3/5 (live mode, family follow — the emotionally resonant, near-term, real-trip features) and long-term platform unity, at the price of ~10 pw of pure parity rewrite, a permanently split map layer, a maintenance-mode web substrate, and a handicapped SEO/community growth channel that needs a satellite static site to compensate. It is the right option if the product's soul is the *phone in your pocket while travelling*; the wrong one if the soul is the *public travel platform on the web*.

### Critical Files for Implementation
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/trips/types.ts
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/trips/useTripMutation.ts
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/map/globeData.ts
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/components/Globe.tsx
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/supabase/migrations/03-catalogue.sql