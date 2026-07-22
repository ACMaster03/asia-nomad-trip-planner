# ASIA NOMAD PLANNER — PRODUCT APP MAP

BASE = `/Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/product`
Stack confirmed: Next.js 16.2.9 (App Router, `proxy.ts` replaces `middleware.ts`, Node runtime) · React 19.2.4 · Tailwind 4 (`@tailwindcss/postcss`) · Supabase via `@supabase/ssr` 0.12 + `@supabase/supabase-js` 2.108 · TanStack Query 5.101 · globe.gl 2.46. TS strict, path alias `@/* → src/*`. No test files, no CI config. This is a "first vertical slice" of a multi-user rewrite of a former single-file static planner.

---

## 1. ROUTE STRUCTURE (`BASE/src/app`)

Root shell:
- `src/app/layout.tsx` — root layout, `<html lang=en>`, imports `globals.css`, wraps children in `Providers`. Metadata only.
- `src/app/providers.tsx` — `'use client'`; single `QueryClient` (staleTime 5min, refetchOnWindowFocus off) in `QueryClientProvider`.
- `src/app/page.tsx` — server; `redirect('/dashboard')`. Comment: "public marketing landing replaces this in Phase 3."

Auth (public, no group):
- `src/app/login/page.tsx` — `'use client'`; magic-link form, `supabase.auth.signInWithOtp({ email, emailRedirectTo: origin+'/auth/callback' })`. Open registration (creates user for any email).
- `src/app/auth/callback/route.ts` — GET; PKCE `exchangeCodeForSession(code)`, redirects to `?next` (default `/knowledge`) or `/auth/auth-code-error`. Handles `x-forwarded-host` for prod.
- `src/app/auth/confirm/route.ts` — GET; OTP `token_hash` flow `verifyOtp({type,token_hash})` (alternate email-template path).
- `src/app/auth/auth-code-error/page.tsx` — static error page, link back to `/login`.

Auth-guarded group `(app)`:
- `src/app/(app)/layout.tsx` — **server-side auth guard**: `supabase.auth.getClaims()`; on error/no-claims → `redirect('/login')`. Renders the top `<nav>` (Dashboard/Itinerary/Money/Map/Explore/Settings links). Nav is ~57px (referenced by MapClient).
- Six routes, all following the same **server-prefetch → HydrationBoundary → client** pattern:
  - `(app)/dashboard/` — `page.tsx` (prefetchTripScreen) + `DashboardClient.tsx`
  - `(app)/itinerary/` — `page.tsx` + `ItineraryHub.tsx` (tabs: Stops/Stays/Transport/Extras)
  - `(app)/money/` — `page.tsx` + `MoneyHub.tsx` (tabs: Budget/Monthly/Ledger)
  - `(app)/map/` — `page.tsx` (prefetches cities+countries+activeTrip) + `MapClient.tsx`
  - `(app)/knowledge/` — `page.tsx` (prefetches fields+cities+countries) + `KnowledgeClient.tsx` (nav labels it "Explore")
  - `(app)/settings/` — `page.tsx` + `SettingsClient.tsx`

Session middleware: `src/proxy.ts` — exports `proxy()` + `config.matcher` (excludes static/_next/images). Delegates to `updateSession`.

---

## 2. COMPONENT ORGANIZATION (`BASE/src/components`)

`components/trips/` (itinerary + money UI, all `'use client'`):
- `Tabs.tsx` — generic in-page tab bar (shared by Itinerary & Money hubs).
- `Modal.tsx` — shared dialog: scroll-lock, Esc-to-close, backdrop click, focus, `role=dialog`. **Reused by map panels too.**
- `Stat.tsx` — small stat tile (label/value/sub/color). No `'use client'` (pure).
- `SaveError.tsx` — red rollback banner (pure).
- `CreateTripEmptyState.tsx` — "No trip yet" → `useMutation(createTrip)` seeds sample trip.
- `BudgetTab.tsx` — budget totals, category bar, per-stop table (`computeBudget`).
- `MonthlyTab.tsx` — per-calendar-month cash-out, earn-target (`monthlyBuckets`).
- `LedgerTab.tsx` — income/expense ledger, monthly P&L vs planned, add/delete entries (`useLedgerMutation`, `ledgerByMonth`, `plannedByMonth`).
- `StopsTab.tsx` — segments table + Gantt-style timeline bars; include-toggle/edit/delete.
- `StaysTab.tsx` / `TransportTab.tsx` / `ExtrasTab.tsx` — CRUD tables over `state.stays/transport/extras`.
- `SegmentForm.tsx` / `StayForm.tsx` / `TransportForm.tsx` / `ExtraForm.tsx` — modal forms (each wraps `Modal`; local `useState`, client-side validation, id via `Math.random`).

`components/map/` (rendered by Globe; import trips/Modal):
- `CountryPanel.tsx` — modal: country visa/safety/currency + per-country city cost table.
- `HazardPanel.tsx` — modal: earthquake (USGS) or monsoon detail.
- `Legend.tsx` — static map legend overlay.

`components/catalogue/` (data-driven KB renderer — "add a field = DB-only change"):
- `CityCard.tsx` — groups `catalogue_fields` by `field_group`, renders per city (server-safe, no `'use client'`).
- `FieldRenderer.tsx` — reads value by `field.source` (attribute/column/country), dispatches via `REGISTRY` by `field.type`; unknown type → `TextField` (fail-safe).
- `renderers/` — `TextField`, `NumberField`, `RangeField`, `ListField`, `ObjectField`, `SubValue` (recursive sub-field), `index.ts` barrel.

Top-level: `components/Globe.tsx` — the globe.gl integration (see §5).

---

## 3. DATA LAYER (`BASE/src/lib`)

Document model: table `trips` cols `id,owner,name,state(jsonb),ledger(jsonb),updated_at,created_at`. `state` (`TripState`) holds meta+rates+segments+stays+transport+extras+notes; `ledger` is a separate jsonb array. **The two columns are written independently so they never clobber each other.** Scalar trip fields (travelers, rates…) live only inside `state` — never duplicated to columns.

`lib/trips/`:
- `types.ts` — all domain types: `TripMeta, Segment, Stay, TransportLeg, Extra, TripState, LedgerEntry, Ledger, Trip, Tier(0|1|2), CurrencyCode`.
- `queries.ts` — Supabase read/write (takes a `SupabaseClient`):
  - `fetchActiveTrip` = most-recently-updated RLS-visible trip (`order updated_at desc, created_at desc, limit 1, maybeSingle`) → **there is no multi-trip concept; "active trip" = single newest row.**
  - `createTrip` — inserts `{owner=auth.uid(), name, state=makeDefaultState(), ledger:[]}`.
  - `writeLedger` — updates ONLY `ledger`+`updated_at`.
  - `writeState` — updates ONLY `state`+`name`+`updated_at`. **Last-write-wins per column; no CRDT/merge, no realtime.**
- `defaultState.ts` — verbatim `DEFAULT_STATE` seed (Asia route, FX rates) + `makeDefaultState()` (structuredClone + backfills `include` flags).
- `budget.ts` — pure math: `buildCityIndex`, `computeBudget`, `ledgerByMonth`, `monthlyBuckets`, `plannedByMonth` (faithful port of static app's core.js/money.js/views.js).
- `format.ts` — `fmtHUF, fmtUSD, toHUF, usdToHUF, nightsBetween, segNights, regName, regColor, monthLabel, monthShort, TIER_LABELS`.
- `keys.ts` — query key `tk.activeTrip = ['active-trip']`.
- `useTripScreen.ts` — `'use client'`; `useQuery(activeTrip)` + `useQuery(cities)` → memoized `cityIdx`. Shared read hook for all trip screens.
- `useTripMutation.ts` — `'use client'`; generic `state`-document editor. Takes an **updater fn** `(cur)=>next`, reads freshest trip from cache, `scope:{id:'state-write'}` serializes writes, optimistic `onMutate`, rollback `onError`, `invalidate onSettled`.
- `useLedgerMutation.ts` — identical pattern for `ledger`, `scope:{id:'ledger-write'}`.
- `prefetch.ts` — `prefetchTripScreen()` server helper: makes a `QueryClient`, prefetches activeTrip+cities, returns it for dehydration.

`lib/catalogue/`:
- `types.ts` — `CatalogueField, ItemField, City, Country, FieldType, FieldSource`. `City.attributes` is `Record<string,unknown>` (opaque jsonb by design).
- `queries.ts` — `fetchFields` (order by sort_order), `fetchCities`, `fetchCountries`.
- `keys.ts` — `qk.fields/cities/countries`.
- `getAtJsonPath.ts` — dotted-path getter over arbitrary objects (used everywhere jsonb is read).

`lib/supabase/` — three distinct client factories (all read the same public env `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`):
- `client.ts` — `createBrowserClient` (`@supabase/ssr`); memoized, browser cookie storage.
- `server.ts` — `createServerClient` + `next/headers` `cookies()` (async in Next 16); getAll/setAll, try-catch on set for Server Components.
- `proxy.ts` — `updateSession(request)`: `createServerClient` over `NextRequest`/`NextResponse` cookies, calls `supabase.auth.getUser()` to refresh + rotate session cookies. Used by `src/proxy.ts`.

`hooks/useIsAdmin.ts` — `'use client'`; queries `profiles.is_admin`. **UI-gating only** (comment stresses RLS is the real boundary; catalogue writes need `is_admin()` server-side).

Auth flow summary: magic link → `signInWithOtp` (PKCE, browser) → email `?code=` → `/auth/callback` `exchangeCodeForSession` → redirect `/knowledge`. `proxy.ts` refreshes session on every non-static request. `(app)/layout.tsx` re-checks `getClaims()` server-side (defense in depth). RLS is the security boundary; catalogue is `to authenticated`.

---

## 4. PLATFORM-AGNOSTIC vs FRAMEWORK-BOUND (KEY FOR RN PORT)

**Bucket A — Pure platform-agnostic TS (zero React/Next/DOM; directly shareable with React Native).** ~690 lines, the entire domain core:
- `src/lib/trips/types.ts` — state shape & types
- `src/lib/trips/budget.ts` — all budget/money math
- `src/lib/trips/format.ts` — currency/date/label formatting
- `src/lib/trips/defaultState.ts` — seed data (uses `structuredClone` — fine on modern Hermes)
- `src/lib/trips/keys.ts`, `src/lib/catalogue/keys.ts` — query-key constants
- `src/lib/catalogue/types.ts` — catalogue types
- `src/lib/catalogue/getAtJsonPath.ts` — jsonb path util

**Bucket B — SDK-bound but framework-neutral (needs only `@supabase/supabase-js`, which runs in RN; take a `SupabaseClient` arg → portable).** ~95 lines:
- `src/lib/trips/queries.ts`, `src/lib/catalogue/queries.ts`

**Bucket C — React-bound but renderer-neutral (React + TanStack Query; work in RN with a different Supabase client factory).** ~140 lines:
- `src/lib/trips/useTripScreen.ts`, `useTripMutation.ts`, `useLedgerMutation.ts`
- `src/hooks/useIsAdmin.ts`
- (`src/lib/trips/prefetch.ts` is React-QueryClient but pulls the Next server client → mixed, see D)

**Bucket D — Web/Next-bound (must be rewritten for RN).** ~2400+ lines:
- Supabase: `src/lib/supabase/client.ts`, `server.ts`, `proxy.ts` (use `@supabase/ssr`, `next/headers`, `next/server` — all web-only; RN uses `supabase-js` + AsyncStorage), `src/proxy.ts`, `src/app/auth/callback/route.ts`, `confirm/route.ts`, `prefetch.ts`.
- All of `src/app/**` (layouts, pages, route handlers, providers).
- All of `src/components/**` (Tailwind classNames, DOM elements, `confirm()/alert()`, `<table>`, `localStorage`).
- `src/components/Globe.tsx` (globe.gl/WebGL — web-only, no RN equivalent).
- `src/lib/map/globeData.ts` — **mixed**: transforms are pure/agnostic, but `loadMapOpts/saveMapOpts` use `localStorage` and it's semantically tied to the globe.

**Rough proportion:** pure-agnostic + SDK-neutral domain logic ≈ **20–25%** of the codebase (and it is cleanly isolated in `src/lib`, with UI reading it through hooks). Framework/web-bound (Next routing, React-DOM components, Tailwind, globe.gl) ≈ **75–80%**. The domain layer is well-separated and RN-friendly; the entire view layer and the Supabase client/session machinery are the port surface.

Portability caveats for the planned evolution: no realtime/subscriptions (would be needed for "live trip-following"); single-active-trip model (no multi-trip / sharing / social schema); last-write-wins on jsonb columns (concurrent multi-user editing not merged); map options persisted in `localStorage`.

---

## 5. GLOBE / MAP IMPLEMENTATION

- Lib: `globe.gl` (wraps three.js/WebGL). Loaded via `next/dynamic(() => import('@/components/Globe'), { ssr:false })` in `MapClient.tsx` (three.js touches `window`).
- `src/components/Globe.tsx` (`'use client'`, ~211 lines) — WebGL lifecycle:
  - Single "BUILD" `useEffect` keyed on DATA deps `[cities, cityIdx, segments, transport]` — constructs `new Globe(el)`, sets points/arcs/polygons/rings/labels accessors, POV `{lat:28,lng:92,alt:2.4}`, autorotate via `.controls()`.
  - `rates` deliberately excluded from deps (read via `ratesRef`) so an FX edit doesn't rebuild the globe.
  - Separate "PATCH" effects mutate the live instance for `opts.day/rotate/borders/hazards` (no rebuild).
  - Cleanup: `removeEventListener`, abort hazard fetch, call globe.gl private `_destructor()`, null the ref. `window resize` handler resizes canvas.
  - Tooltips are HTML strings built in-component (esc-escaped), rendered by globe.gl.
- External fetches:
  - `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson` — live M4.5+ quakes (AbortController; re-checks live state in `.then`; fails silent on offline/CORS).
  - `/vendor/countries.geojson` (local, module-cached in `_featsCache`) — borders.
  - Textures `/vendor/earth-day.jpg`, `/vendor/earth-night.jpg` (in `public/vendor/`).
- `src/lib/map/globeData.ts` — pure transforms: `buildRoute` (segments→ordered stops + home origin detection via `HOME_PLACES` Budapest/Vienna), `buildArcs` (flight arcs, booked=solid amber), `seasonalHazards` (monsoon from `attributes.weather.months[thisMonth].rain>=250`), `quakesFromFeed`, `flightFor/isBooked/normCity`, `COUNTRY_ALIAS`, `isoToFlag`, `quakeSafetyNote`, `loadMapOpts/saveMapOpts` (**localStorage key `anp_map_opts`**).
- Point click → `router.push('/knowledge')`; polygon click → `CountryPanel`; hazard click → `HazardPanel`.

---

## 6. PACKAGE.JSON DEPENDENCIES

dependencies:
- `@supabase/ssr` ^0.12.0
- `@supabase/supabase-js` ^2.108.2
- `@tanstack/react-query` ^5.101.2
- `globe.gl` ^2.46.1
- `next` 16.2.9
- `react` 19.2.4
- `react-dom` 19.2.4

devDependencies:
- `@tailwindcss/postcss` ^4
- `tailwindcss` ^4
- `typescript` ^5
- `eslint` ^9
- `eslint-config-next` 16.2.9
- `@types/node` ^20, `@types/react` ^19, `@types/react-dom` ^19

Scripts: `dev`/`build`/`start`/`lint` (plain `next`). No three.js direct dep (transitive via globe.gl). No realtime, no state lib beyond TanStack Query, no form/validation lib.

---

## 7. THEMING / STYLING

- Tailwind 4 via PostCSS only — `postcss.config.mjs` = `{ '@tailwindcss/postcss': {} }`. **No `tailwind.config.*` file** (Tailwind 4 CSS-first config).
- `src/app/globals.css` — `@import "tailwindcss";` + `@theme inline` mapping CSS vars → Tailwind tokens (`--color-background/foreground`, `--font-sans/mono` referencing `--font-geist-*`, though Geist fonts are **not actually wired** in `layout.tsx`; body falls back to `Arial, Helvetica, sans-serif`).
- CSS vars: `--background/--foreground` on `:root`, overridden in `@media (prefers-color-scheme: dark)`.
- **Dark mode = OS-driven only** (`prefers-color-scheme`); no theme toggle, no `class`/`data` strategy. Components hardcode `dark:` utility variants throughout (e.g. `dark:border-neutral-800 dark:bg-neutral-900`).
- Accent color: teal (`bg-teal-600`, `text-teal-700/400`) for primary actions/active tabs; region palette hardcoded in `format.ts` `regColor` (`#37b3a4` SE / `#6c8ccf` EA / `#cf8a6c` SA) and reused on the globe. Map overlays use dark hex literals (`#0f1419`, `#2a3642`, `#e8edf2`) independent of theme.
- One custom class `.map-overlay` referenced in `Legend.tsx` but not defined in `globals.css` (no effect).