# OPTION A — Evolve the Next.js App: PWA First, Capacitor Wrapper for Stores

One codebase, no framework migration. The Next.js 16 app at `/Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product` remains the single product surface for web, installed PWA, and (later) store-distributed iOS/Android builds via Capacitor.

---

## 1. Architecture & repo structure

### 1.1 The core architectural decision this option forces

Capacitor cannot run a Next.js server inside the native shell. Two sub-modes exist:

- **(a) Static export** (`output: 'export'`) bundled into the app — kills RSC/server prefetch, requires reworking every `page.tsx` that does `prefetchTripScreen()`.
- **(b) Remote-URL shell** — the Capacitor WebView loads the deployed Vercel app; native plugins are bridged in via `@capacitor/core` detection.

**Recommendation: (b) remote-URL shell**, because it preserves the existing server-prefetch → HydrationBoundary pattern untouched, gives instant OTA (it's just the website — no OTA vendor, no Capgo, no 2.3.1 anxiety), and the app already requires connectivity for Supabase anyway. The tradeoff — offline is handled at the service-worker layer (shared with the PWA), not by bundling. Apple's Guideline 4.2 risk is identical in both sub-modes; it's decided by native polish, not by where the HTML comes from. Keep (a) as a documented fallback if reviewers push back on the remote shell.

### 1.2 Repo layout (evolution, not restructure)

```
asia-nomad-planner/
├── index.html, js/            # static fallback — freeze, eventually delete
├── supabase/
│   └── migrations/
│       ├── 01..05 (existing)
│       ├── 06-multi-trip-sharing.sql      # active_trip per user, share_links
│       ├── 07-places-checkins.sql         # places, checkins, ratings/comments
│       ├── 08-follow-feed.sql             # trip_followers, trip_events, media
│       ├── 09-notifications.sql           # push_subscriptions, notification_queue
│       └── 10-integrations-cache.sql      # fx_rates, weather_cache, advisories, flights_cache
├── product/                    # THE app (unchanged root)
│   ├── src/app/
│   │   ├── (app)/…             # existing 6 sections, evolved in place
│   │   ├── (public)/           # NEW: no-auth surface
│   │   │   ├── follow/[shareCode]/   # family live-follow page
│   │   │   └── p/[placeSlug]/        # future public place pages (SEO)
│   │   ├── api/                # NEW: route handlers (server-only keys live here)
│   │   │   ├── cron/fx/  cron/weather/  cron/advisories/   # Vercel Cron
│   │   │   ├── flights/[number]/      # AeroDataBox proxy + cache
│   │   │   ├── push/send/             # web-push + FCM fanout (service key)
│   │   │   └── media/sign/            # signed upload URLs (Supabase Storage)
│   │   ├── manifest.ts         # NEW: PWA manifest
│   │   └── …
│   ├── src/lib/
│   │   ├── trips/  catalogue/  supabase/  map/   # existing
│   │   ├── live/               # NEW: checkins, feed, realtime channel hooks
│   │   ├── native/             # NEW: capability shims (see 1.3)
│   │   └── integrations/       # NEW: typed clients for cached API tables
│   ├── src/sw.ts               # NEW: service worker (serwist/next-pwa)
│   └── public/…
└── native-shell/               # NEW: Capacitor project (M4+)
    ├── capacitor.config.ts     # server.url → https://app.<domain>
    ├── ios/  android/
    └── src/bridge.ts           # registers plugins, deep links, push token relay
```

No monorepo tooling, no workspace packages. The one discipline to adopt now: **everything new in `src/lib` stays UI-free and DOM-free where possible** (the existing Bucket A/B separation is already good) — this keeps a future Option-B-style native rebuild survivable if Option A hits its ceiling.

### 1.3 The capability shim layer (`src/lib/native/`)

The same React components run in three runtimes: browser tab, installed PWA, Capacitor WebView. One module per capability with runtime detection (`Capacitor.isNativePlatform()`):

| Capability | Browser/PWA path | Capacitor path |
|---|---|---|
| `push.ts` | Web Push API (VAPID), `PushManager.subscribe` | `@capacitor/push-notifications` → FCM/APNs token |
| `camera.ts` | `<input type="file" accept="image/*,video/*" capture>` | `@capacitor/camera` (photos), file input still fine for video |
| `geo.ts` | `navigator.geolocation` | `@capacitor/geolocation` (better prompts, background option) |
| `share.ts` | `navigator.share` / clipboard | `@capacitor/share` |
| `storage.ts` | localStorage/IndexedDB | `@capacitor/preferences` for tokens if needed |

All tokens (web-push subscription JSON or FCM token) land in one `push_subscriptions` table with a `platform` column; the server fanout at `/api/push/send` dispatches per platform. This is the single most important abstraction in Option A — build it in M1, before any native work.

### 1.4 How each hard capability works in this model — honest version

**Push notifications** (needed for: stay free-cancellation deadlines, "we checked in!" family pings)
- Web/Android PWA: Web Push works fully; fired from a Vercel route handler using `web-push` (VAPID keys in env). Scheduled pushes (cancellation deadlines) via Vercel Cron scanning a `notification_queue` table built from `state.stays` deadlines.
- iOS PWA: works **only after manual Add to Home Screen** (iOS 16.4+), and EU/DMA status is fluid — for a Hungarian user base, treat iOS PWA push as *bonus, not baseline*. This is the #1 reason the Capacitor build exists.
- Capacitor: `@capacitor-firebase/messaging` for unified FCM tokens (mind the APNs-hex vs FCM-token conversion gotcha). Needs an Apple Developer account ($99/yr) + APNs key.

**Camera / video upload**
- The boring answer works everywhere: `<input type="file" capture="environment">` opens the native camera in Safari, Chrome, and WebViews alike. Upload via signed URL to Supabase Storage (photos) / Mux direct-upload (video). Client-side image downscale (canvas) before upload to protect the 1 GB free tier.
- Capacitor adds polish (native camera UI, gallery multi-select) but is not a blocker. **Video recording of yourselves + upload is fully achievable in pure PWA.**

**GPS check-ins**
- `navigator.geolocation.getCurrentPosition` on user action ("Check in here") — works in all three runtimes. Foreground-only is *fine* for the actual product need: check-ins are explicit acts, not continuous tracking.
- What Option A **cannot do well**: continuous background location ("family watches our dot move in real time"). iOS suspends WebView JS in background; Capacitor background-geolocation plugins exist but are the flakiest corner of the ecosystem. Design the follow feature around **event-based location** (check-ins, "arrived in Hanoi" pings, flight positions from AeroDataBox) rather than a live dot. This is a product framing choice that makes the constraint invisible.

**Offline**
- Serwist (next-pwa successor) service worker: precache the app shell, stale-while-revalidate for catalogue queries, network-first for trip state.
- TanStack Query persistence: `@tanstack/query-persist-client` + IndexedDB persister — the trip doc, cities, and catalogue survive offline reads for free because everything already flows through TanStack Query. That's a genuinely lucky consequence of the current architecture.
- Offline **writes**: keep last-write-wins but make it safer — queue mutations in IndexedDB (TanStack `onlineManager` + persisted mutations), and add a `state.rev` counter + `updated_at` guard in `writeState` so a stale offline client warns instead of silently clobbering the partner's edits. Full merge/CRDT is explicitly out of scope for Option A (and honestly for a 2-editor product, out of scope, period).

---

## 2. Reused vs rewritten (real files)

### Reused as-is (~everything — that's the point of Option A)
- Entire domain layer: `src/lib/trips/types.ts`, `budget.ts`, `format.ts`, `defaultState.ts`, `queries.ts`, `keys.ts`; `src/lib/catalogue/*`; `getAtJsonPath.ts`.
- Hooks: `useTripScreen.ts`, `useTripMutation.ts`, `useLedgerMutation.ts`, `useIsAdmin.ts` — the optimistic-update/scope-serialized mutation pattern extends directly to new documents (checkins are rows, not docs, but the pattern of `scope`-keyed mutations carries over).
- All UI: `components/trips/*` (Tabs, Modal, forms, all tabs), `components/catalogue/*` (the dynamic FieldRenderer registry is a real asset — new place/checkin fields can ride the same metadata pattern), `components/map/*`, `Globe.tsx`, `globeData.ts`.
- Auth chain: `src/proxy.ts`, `lib/supabase/{client,server,proxy}.ts`, `app/auth/callback/route.ts`, `(app)/layout.tsx` guard.
- Supabase schema: migrations 01–05, `can_access_trip()`, `trip_invites`/`trip_members` (dormant in the product app but already the right shape for family sharing — migration 06 wires them into UI rather than inventing new tables).

### Modified
- `lib/trips/queries.ts` — `fetchActiveTrip` "newest row wins" must die once multi-trip/sharing exists → explicit `profiles.active_trip_id` (or localStorage + query param), plus `fetchTrips()` list. Add `rev`/`updated_at` guard to `writeState`/`writeLedger`.
- `app/layout.tsx` + `globals.css` — theming: move from `prefers-color-scheme` to `class`/`data-theme` strategy with CSS vars; destination palettes = rows in a `themes` table or static JSON (10–20 city palettes), applied by setting vars. The Tailwind-4 CSS-first setup makes this a `@theme` variable swap, but **every hardcoded `dark:` and `teal-*` utility across `components/` needs a sweep** — tedious, not hard (~1 week with Claude Code).
- `Globe.tsx` / `MapClient.tsx` — add settable timezone/day-night fix (owner note); on Capacitor it renders via WebGL-in-WebView, which is fine on 2024+ phones for this scene complexity (30 points + arcs + one texture sphere), but add a `lite` mode (static MapLibre GL or even 2D) behind a device check as insurance.
- `loadMapOpts/saveMapOpts` in `globeData.ts` — localStorage is fine in all three runtimes; no change needed, contrary to instinct.
- `login/page.tsx` — magic link works but is miserable inside a native shell (leaves the app for Mail). Add password or OTP-code entry and Google/Apple OAuth (Apple Sign-In is **required by Apple** if you offer Google) before store submission.
- `prefetch.ts` + all `(app)/*/page.tsx` — unchanged in remote-URL mode; would need rework only in the static-export fallback.

### Net-new (nothing rewritten, all additive)
- `(public)/follow/[shareCode]` follower surface; `src/lib/live/*`; `src/lib/native/*`; `src/sw.ts` + `manifest.ts`; `/api/*` route handlers (the app currently has zero server-only code paths — the API keys for flights/banking/push all need this layer); migrations 06–10; `native-shell/`.

---

## 3. Vision pillars on this architecture

### 3.1 Live check-ins & ratings (owner vision #3)
- Migration 07: `places` (seeded from catalogue landmarks + OSM/Wikidata/Foursquare, per integrations report), `checkins (id, trip_id, user_id, place_id nullable, name, lat, lng, kind[attraction|food|stay|transport|note], rating smallint, comment text, media refs, created_at)`, RLS = `can_access_trip(trip_id)` for write, visibility flag for read.
- Check-ins are **normalized rows, not part of `trips.state`** — this is the moment the document model stops growing. Trip *plan* stays a document (it works, two editors, LWW acceptable); trip *history/social* is relational from day one because it must be queryable, public-aggregatable, and realtime-subscribable.
- UI: a "Live" FAB/tab visible during trip dates → one-tap check-in (GPS + nearest place suggestion from Foursquare/places table), star rating, comment, photo. Fastest path to demo-able: this plus the follow page.

### 3.2 Family follow — realtime (vision #5)
- Migration 08: `share_links (trip_id, code, audience[follow], created_at, revoked)` + `trip_events` (denormalized feed: checkin/arrival/departure/flight/media events, written by triggers on checkins + by client on stop transitions).
- `/follow/[code]` is a **public (anon) Next.js page** — no account needed for grandma. RLS exposure via a SECURITY DEFINER RPC `get_followed_trip(code)` returning a sanitized projection (current stop, recent events, media) — never raw `trips.state` (it contains budgets/ledger).
- Realtime: Supabase Realtime **Broadcast** on channel `trip:{id}:live` for instant "new check-in" on open follow pages; page also just refetches on interval as fallback. Free tier (200 concurrent, 2M msg/mo) is laughably sufficient for family-scale; Pro ($25) only when the platform ambition (#4) materializes.
- Web Push to followers who opt in ("notify me when they check in") via the same `push_subscriptions` fanout.
- This pillar is where Option A **shines**: a shareable URL that works on any device with zero install is a better family-follow product than a native app could be.

### 3.3 Media (photos/video, vision #5)
- Photos: Supabase Storage bucket `trip-media`, signed uploads via `/api/media/sign`, client-side resize; Cloudflare Images later for variants if egress bites.
- Video: Mux free tier (direct-upload URLs from a route handler; webhook sets playback ID on the `media` row). Adaptive playback in `<mux-player>` works in PWA and WebView identically.
- Cap: no background upload — a video upload dies if the user backgrounds the PWA mid-upload on iOS. Mitigate with tus/resumable (Supabase Storage supports TUS; Mux direct uploads are resumable). Capacitor build largely fixes this (app stays alive longer, can use native uploader plugin later).

### 3.4 Community/public data (vision #2, #4)
- The `checkins` ratings/comments aggregate into public place scores: nightly cron materializes `place_stats`. `catalogue_fields`' metadata-driven rendering means community-derived fields (avg rating, "12 travellers ate here") appear in the KB with a DB row, no frontend change — the existing dynamic-catalogue investment pays off directly.
- Public/SEO surface `(public)/p/[placeSlug]` is where Option A is **structurally strongest vs any Expo path**: Next.js RSC/SEO is the native tool for a public content platform. If pillar #4 is the long-term business, this option protects it best.
- Moderation, anon-read RLS policies (currently catalogue is authenticated-only by design), and privacy defaults (check-ins private per trip unless opted public) are the real work here — schema, not framework.

### 3.5 Integrations (the "~25 sites in one" notes)
All server-side cached in Postgres, per the integrations report; the app reads only its own tables (fast, offline-cacheable, key-safe):
- FX: Frankfurter daily cron → `fx_rates` (replaces the static rates in `state.rates` — one small `useTripScreen` change to prefer live rates).
- Weather: Open-Meteo per catalogue city, cron-cached → drives the "weather" segment field + monsoon layer (replacing hand-entered `attributes.weather`).
- Flights: AeroDataBox via `/api/flights/[number]` with per-flight cache; feeds Transport tab status + a `flight` event into the follow feed ("their plane just landed" — high family delight per API call).
- Safety: USGS (kept, client-side) + GDACS + FCDO cron → advisories table → country panels + follow page banner.
- Visa/cost-of-living: stays curated in the existing catalogue (correct per research — no viable cheap API); community spend data eventually feeds cost-of-living.
- Open banking (Enable Banking): **defer to last**; it's a compliance-flavored time sink. When done, it's a route handler + matching UI in Ledger — architecture-compatible, just expensive in weeks.

---

## 4. Phased milestones (person-weeks, one skilled dev + Claude Code)

| # | Milestone | Contents | Effort |
|---|---|---|---|
| **M0** | **PWA + polish debt** | manifest + Serwist SW + install prompt; TanStack persister (offline read); theming system (`data-theme`, dark/light toggle, `dark:` sweep, 10 destination palettes); owner UX notes batch 1 (Overview stat emphasis, cheat-sheet rename, Stays declutter/chrono, KB empty-start + country filter, onboarding trip-basics flow); auth: password/OTP + Google | **3–4 wk** |
| **M1** | **Sharing + notifications** | Wire dormant `trip_invites`/`trip_members` into Settings UI (viewer role enforced in RLS); multi-trip switcher (kill "newest row = active"); `lib/native/` shims; Web Push (VAPID) + `push_subscriptions` + `notification_queue`; **stay cancellation-deadline pushes** (owner's concrete ask); Vercel Cron: FX + weather + advisories | **3 wk** |
| **M2** | **Live mode + family follow** — *the trip-critical milestone* | Migrations 07–08; check-in flow (GPS, rating, comment, photo via Supabase Storage); `/follow/[code]` public page + Realtime broadcast + follower push opt-in; trip_events feed; write-guard (`rev`) on state writes | **4 wk** |
| **M3** | **Media + integrations round 2** | Mux video upload/playback in feed; AeroDataBox flight status in Transport + follow feed; Budget/Monthly view reworks from owner notes; Timeline filters/grouping | **3 wk** |
| **M4** | **Capacitor store builds** | `native-shell/` remote-URL config; FCM/APNs push path through the shim; Apple Sign-In; native splash, safe-areas, back-button (Android), deep links (`/follow/…`); Guideline-4.2 hardening (no browser-chrome feel, push + camera + geo demonstrably native); store assets, review cycles | **3–4 wk** (of which ~1.5 wk is review-cycle slack) |
| **M5** | **Community layer** | Public place pages + anon-read RLS + place_stats aggregation; moderation basics; privacy controls | **3 wk** |
| **M6** | **Bank import (optional)** | Enable Banking restricted-prod, txn import → ledger suggestions | **2–3 wk** |

Total to full vision: ~21–24 person-weeks. **The upcoming real trip is served by M0–M2 (~10 wk) with zero App Store involvement** — that's the schedule argument for Option A: live-follow ships as a URL, months before any store review.

---

## 5. Risks, failure modes, what becomes HARD later

1. **Guideline 4.2 rejection is the headline risk.** A remote-URL WebView of a responsive website is exactly what Apple rejects. Mitigation is real but costs polish-weeks: native push, camera, geolocation actually used; no pinch-zoom/text-selection artifacts; native splash; offline handling. Failure mode: 2–3 rejection cycles (budgeted in M4); worst case, fall back to static-export + more native chrome, or accept **Android-only store presence + iOS-as-PWA** for a season. Note: for *this* product the store build is genuinely optional until the community phase — the family-follow use case never needs it.
2. **iOS PWA push fragility (EU/DMA).** If EU Home-Screen-webapp capabilities regress again, the owner's own iPhone loses cancellation-deadline pushes until M4. Mitigation: email fallback for deadline alerts (Supabase + Resend, trivial).
3. **WebView performance ceiling** — the globe, long media feeds, camera-to-upload latency all run through a WebView on native. Fine at family scale; if the social platform (#4/#5) takes off, a video-feed-in-WebView will feel one notch below TikTok-class native. **This is the thing Option A makes hard later**: there is no incremental path from "wrapped WebView" to "native screens" — Capacitor doesn't mix native UI into the tree the way Expo does. The hedge is the discipline in §1.2: keep `src/lib` DOM-free so a later Expo app (Option B) reuses Buckets A–C wholesale.
4. **Background anything** (continuous location, background upload, offline sync while suspended) stays permanently weak. Product must keep being designed around explicit events. If the owner ever truly wants "watch our dot move," Option A cannot deliver it well.
5. **LWW document model under more writers.** Fine at 2 editors; if collaborative planning becomes a feature, `trips.state` needs decomposition into the (already drafted, unused) normalized tables in `supabase/schema.sql` — a known, bounded migration, made easier by the fact that social data (M2+) never enters the document.
6. **Single-runtime coupling drift** — the quiet failure mode: without the `lib/native` shim discipline, Capacitor-only code leaks into components and the three runtimes fork subtly. Enforce "components never import `@capacitor/*` directly" as a lint rule from M1.
7. **Vercel + Supabase free-tier cliffs**: storage egress (media) and Realtime messages are the first paid walls; both are $25/mo class, not architectural.

---

## 6. Business-model fit

- **Fits the funnel-shaped business best of all options.** If pillar #4 (public travel platform) is the eventual revenue engine, the moat is SEO-indexed community place data + zero-friction shareable follow links — both are Next.js-native strengths and Expo weaknesses. Every follow link sent to a family member is an acquisition surface with no install wall.
- Monetization slots cleanly: free (1 trip, follow links) → Pro subscription (multi-trip, video, bank import, flight tracking) via Stripe on the web — **avoiding Apple's 30% for web-sold subscriptions**, which a wrapped app can do more naturally than a native-first app (subscribe on web, consume anywhere). Affiliate rails (Booking/agoda links already in `stays.url`, sherpa° eVisa revenue-share, Foursquare-powered recommendations) need the web surface anyway.
- Cost floor is exceptional: ~$0/mo through M2 (free tiers everywhere), ~$25–50/mo (Supabase Pro + Mux overflow) at early-community scale, + $99/yr Apple at M4.
- The honest business caveat: if the pivot ever becomes "we're a mobile-first social video app," Option A's ceiling (WebView media UX, no background location) becomes a rebuild-shaped tax — but by then Buckets A–C plus the entire Supabase backend carry over to an Expo client, so the sunk cost is confined to the view layer that would need redesign for mobile-native anyway.

---

### Critical Files for Implementation
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/trips/queries.ts (active-trip selection, write guards — first thing multi-trip/sharing touches)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/app/(app)/layout.tsx (auth guard + nav shell; gains theme provider, Live tab, native-safe-area handling)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/app/globals.css (Tailwind 4 CSS-first theme — the entire theming/palette system lands here)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/supabase/migrations/03-catalogue.sql (RLS + is_admin pattern that migrations 06–10 extend for checkins/follow/public data)
- /Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product/src/lib/trips/useTripMutation.ts (optimistic-write pattern to extend with rev-guard and offline mutation queue)