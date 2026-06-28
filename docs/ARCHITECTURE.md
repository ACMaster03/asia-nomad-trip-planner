# Product architecture & migration plan

How the personal trip planner becomes a **multi-user product** where people register,
plan their own trips, and share a common knowledge base (cities, prices, flights,
hazards, map data).

> Status: **plan, not built.** The current app (vanilla `js/*.js` + Supabase) keeps
> working unchanged. This is the target to migrate *to* when we commit to the product.

---

## TL;DR

- **Stack:** **Next.js (App Router) + Supabase + Vercel**, Tailwind + shadcn/ui,
  TanStack Query, `globe.gl` in a client-only component, Stripe for paid plans later.
- **Backend is already chosen and largely built:** Supabase (Postgres + Auth + RLS).
  The "shared vs private data" split is exactly what RLS does — and our `schema.sql`
  already has trips / members / invites / cities.
- **Only the frontend is a real rewrite**, and the current app is its working spec:
  each `view*()` → a component, `cloud.js` → a typed Supabase data layer, the globe →
  a `<Globe>` component.
- **Migrate when** we add registration + billing + a landing page — not before.

---

## 1. Data model: shared vs private

### Shared catalogue (admin-curated, everyone reads)
| Table | Contents | Source today |
|-------|----------|--------------|
| `cities` | name, country, lat/lng, costs, food, transport, internet, landmarks, weather | `cities.json` (seed it in) |
| `countries` | code, name, visa, best_time, safety, currency, iso2 (flag) | `cities.json` `countries` map + `COUNTRY_META` |
| `route_prices` *(opt)* | from/to city, typical price, currency, notes | new — shared flight-price reference |
| `hazards` *(opt/live)* | seasonal risk; live quakes/cyclones via a function | computed + USGS feed today |

**RLS:** any authenticated user can `select`; only **admins** can write.

### Private per user (+ invited collaborators)
| Table | Contents | Status |
|-------|----------|--------|
| `trips` | name, base currency, budget cap, start date, rates, meta | ✅ in schema |
| `trip_members`, `trip_invites` | sharing + invites | ✅ built |
| `segments` (stops), `stays`, `transport`, `extras`, `notes` | the itinerary | ✅ in schema (normalized) |
| `ledger` | income/expense rows (the Money tab) | ✅ in schema |

**RLS:** scoped to trip owner/members via `can_access_trip()` — already written.

> **Change from today:** the current app stores the whole trip as one JSON blob
> (`trips.state` / `trips.ledger`) — a pragmatic sync hack for the vanilla app. The
> product should use the **normalized tables** (already drafted) so we can query, filter,
> and do realtime per-row. The document columns can be dropped once migrated.

### Admin role
Add `profiles (id uuid → auth.users, is_admin bool default false, display_name, …)`.
Shared-table write policies check `exists(select 1 from profiles where id=auth.uid() and is_admin)`.
A tiny internal admin screen (or just SQL/Studio at first) edits the catalogue.

### User-contributed cities (optional)
`cities.owner` + `is_public` already exist: users add private cities; an admin can
promote good ones to the shared catalogue.

---

## 2. Server-side bits (secrets / CORS)

A static client can't hold API keys or call non-CORS feeds. Put these in **server code** —
Next route handlers (`app/api/...`) or **Supabase Edge Functions**:
- Real **flight prices** (paid APIs — key must stay server-side).
- Live **typhoon/cyclone tracks** (feeds without CORS) → proxy + cache.
- Stripe webhooks.
- Any admin bulk imports.

USGS earthquakes are CORS-open and can stay client-side.

---

## 3. Frontend structure (Next.js App Router)

```
app/
  (marketing)/            # public, SSG/ISR — SEO matters here
    page.tsx              # landing
    pricing/page.tsx
  (app)/                  # authenticated app shell
    layout.tsx            # nav + auth guard
    overview/page.tsx
    timeline/page.tsx
    map/page.tsx          # <Globe> (client-only)
    stays/page.tsx
    transport/page.tsx
    budget/page.tsx
    monthly/page.tsx
    money/page.tsx
    knowledge/page.tsx    # shared catalogue browser
    settings/page.tsx
  api/                    # server route handlers (flight prices, hazards proxy, stripe)
  auth/callback/route.ts  # Supabase auth callback
components/
  globe/Globe.tsx         # wraps globe.gl (dynamic import, ssr:false)
  ...
lib/
  supabase/{client,server}.ts   # @supabase/ssr
  queries/                # typed data access (replaces cloud.js)
  types.ts                # generated from Supabase
```

- **Routing** solves your URL ask: real `/map`, `/budget`, … (no `#`), shareable,
  SSR/SSG where it helps. Marketing pages are SSG (fast, indexable); the app is
  client-rendered behind auth.
- **Auth:** Supabase Auth via `@supabase/ssr` (server + client). Magic link already works;
  add Apple/Google providers (ties to your Apple-login priority).
- **Shared data caching:** TanStack Query caches the catalogue so it loads once.
- **Map:** `globe.gl` is framework-agnostic — wrap it in a `dynamic(() => …, {ssr:false})`
  client component; the current `js/map.js` logic ports almost directly.

### Component mapping (your current code is the spec)
| Today | Becomes |
|-------|---------|
| `js/views.js` `view*()` | one component per route |
| `js/forms.js` modals | form components / dialogs |
| `js/map.js` | `components/globe/Globe.tsx` |
| `js/money.js` | `money/page.tsx` + ledger queries |
| `js/cloud.js` | `lib/supabase/*` + `lib/queries/*` |
| `js/core.js` helpers (budget, fmt) | `lib/budget.ts`, `lib/format.ts` |
| `cities.json` | seed → shared `cities` table |

---

## 4. Phased migration

**Phase 0 — Decide & scaffold (low risk):** create the Next app, wire Supabase auth
(`@supabase/ssr`), deploy an empty authed shell to Vercel. Generate DB types.

**Phase 1 — Shared catalogue:** create `cities`/`countries` tables + admin write RLS,
seed from `cities.json`, build the read-only Knowledge Base + Map screens against them.
(Map + KB are the most self-contained — good first port.)

**Phase 2 — Private trips (normalized):** port trips/stops/stays/transport/extras/ledger
to the normalized tables; build Overview/Timeline/Budget/Monthly/Money. Reuse the budget
math from `js/core.js`. Sharing/invites already work.

**Phase 3 — Product shell:** landing + pricing pages (SSG), Stripe plans + webhook,
account settings, onboarding. Add Apple/Google login.

**Phase 4 — Server data:** flight-price + hazard proxies (route handlers / Edge Functions),
caching, admin catalogue editor.

### What carries over with zero rework
- Supabase project, **schema, RLS, auth, invites** (the hard part).
- All the **domain logic** (budget engine, FX, P&L, flight matching, hazard rules) —
  copy from `js/*.js`.
- `cities.json` as the catalogue seed.
- The whole UX/IA — it's a proven, working design.

### What genuinely changes
- A **build step** appears (Vite/Next) — we lose "no-build", gain code-splitting
  (the heavy globe only loads on `/map`), real routes, components, types.
- Deploy becomes a Next build on Vercel (still trivial).
- Per-row data instead of one JSON blob (better querying/realtime).

---

## 5. Open decisions (for later)
- **Free vs paid tiers** — what's gated? (e.g., N trips free, unlimited paid; collaborators paid.)
- **Catalogue editing** — internal-only admin, or community contributions with moderation?
- **Realtime** — live co-editing for shared trips (Supabase Realtime) — nice-to-have.
- **Mobile** — responsive web first; native/PWA later if needed.
- **i18n** — the planner is English now; product may want HU/others.

---

## 6. Why not the alternatives
- **Plain Vue/React SPA (Vite):** fine for the authed app, but no SSR for marketing/SEO
  and no server layer for secrets — you'd bolt those on anyway. A meta-framework gives
  them for free.
- **Nuxt (Vue):** a great, slightly simpler alternative; chosen Next for Vercel-native
  deploy, the most mature Supabase support, the largest ecosystem, and hireability.
- **Angular:** heaviest of the three; explicitly not wanted.
- **Custom Node/Express backend:** unnecessary — Supabase covers auth + DB + RLS +
  storage + functions, which is most of the backend you'd otherwise hand-build.
