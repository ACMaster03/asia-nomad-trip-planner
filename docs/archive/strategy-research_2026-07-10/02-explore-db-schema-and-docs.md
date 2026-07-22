# Exploration report — `/Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner` (excl. `product/src`)

Base path for all files below: `/Users/grohmannpatrik/Claude/Projects/Ázsia nomad trip planning/asia-nomad-planner/`

---

## 1. Supabase schema (from `supabase/migrations/*.sql` + `supabase/schema.sql`)

There are **two overlapping schemas**. `supabase/schema.sql` is the original "forward-looking" target (trips + normalized itinerary + per-user cities). Migrations `03`–`05` then **supersede** part of it to build the multi-user product's shared catalogue. Notably `03-catalogue.sql` **DROPs** the draft `public.cities` from `schema.sql` and rebuilds it as an admin catalogue.

### Files
- `supabase/schema.sql` — full target schema (266 lines)
- `supabase/migrations/01-document-sync.sql` — adds `trips.state` + `trips.ledger` jsonb, loosens `trips_update` RLS to members
- `supabase/migrations/02-invites.sql` — `trip_invites` table + `has_pending_invite()` + invite/member RLS
- `supabase/migrations/03-catalogue.sql` — `profiles`, `countries`, `cities` (rebuilt), `catalogue_fields`, `is_admin()`, signup trigger, anti-escalation trigger
- `supabase/migrations/04-seed-catalogue.sql` — seeds 16 countries + first batch of cities
- `supabase/migrations/05-add-cities.sql` — adds Austria + Philippines countries and 9 more cities (Vienna, Phuket, Krabi, Koh Samui, Hoi An, Nha Trang, Yogyakarta, Cebu, El Nido)

### Tables

**`trips`** (schema.sql:19-37) — one row per trip. Columns:
`id uuid pk`, `owner uuid → auth.users`, `name text`, `base_currency text 'HUF'`, `budget_cap numeric`, `start_date date`, `travelers int`, `rates jsonb`, `meta jsonb`, **`state jsonb`** (whole app state doc), **`ledger jsonb`** (income/expense array), `created_at`, `updated_at`.
- The app uses the **document model**: entire trip `state` + income `ledger` are stored as JSON on this one row. The normalized child tables below exist but are **not written by the current app**.

**`trip_members`** (schema.sql:41-47) — the sharing table. `trip_id`, `user_id`, `role text check in ('editor','viewer') default 'editor'`, `added_at`, PK `(trip_id, user_id)`.

**`trip_invites`** (schema.sql:159-171 / migration 02) — email-based invites. `id`, `trip_id`, `email`, `role ('editor'|'viewer')`, `invited_by`, `status ('pending'|'accepted'|'revoked')`, `created_at`, `accepted_at`, `accepted_by`. Indexed on `lower(email),status` and `trip_id`.

**Normalized itinerary tables (drafted, unused by app):**
- `segments` (schema.sql:54-69) — id text (keeps app ids e.g. "sg_han"), trip_id, country, city, arrive/depart date, nights, tier, color, include, notes, weather, `extra jsonb`, sort_at
- `stays` (71-86) — id, trip_id, seg_id, name, platform, url, currency, ppn (price/night), nights, rating, status, include, notes, `extra jsonb`
- `transport` (88-103) — id, trip_id, type, from_loc, to_loc, date, provider, url, currency, price, status, include, notes, `extra jsonb`
- `extras` (105-113) — id, trip_id, label, category, currency, amount, include
- `notes` (116-121) — trip_id, city, body, PK (trip_id, city)
- `ledger` (126-138) — id uuid, trip_id, entry_date, `type check ('income','expense')`, category, amount, currency, note, created_by, created_at. Index on (trip_id, entry_date).

**Catalogue tables (migration 03 — the product's shared KB):**
- `profiles` (03:41-46) — `id uuid → auth.users`, `display_name`, `is_admin bool default false`, `created_at`. Auto-created by `handle_new_user()` trigger on `auth.users` insert; backfilled for existing users.
- `countries` (03:100-110) — `code text pk` (English name, e.g. 'Thailand'), name, iso2, currency, visa, best_time, safety, `extras jsonb`, updated_at.
- `cities` (03:119-137, **rebuilt, replaces the schema.sql draft**) — `id bigint identity pk`, `country → countries.code`, `city`, region, region_name, lat, lng, `daily_living_mid`, `accom_mid`, `rent_monthly` (denormalized sortable scalars), `attributes jsonb` (everything else incl. all future fields), sort_order, updated_at, `unique(country,city)`. Indexes on country, region, daily_living_mid, GIN on attributes.
- `catalogue_fields` (03:167-179) — **metadata that drives a dynamic frontend**: `key pk`, label, field_group, `type check ('text','number','range','list','object')`, `source check ('attribute','column','country')`, unit, sort_order, show_in_list, `item_fields jsonb`. Seeded (03:186-236) to describe current cities.json fields — adding a row + a value in `cities.attributes` surfaces a new field with zero frontend code.

### Functions / triggers
- `can_access_trip(t uuid)` (schema.sql:177-181) — SECURITY DEFINER; true if caller is trip owner OR in trip_members. Core of all trip RLS.
- `has_pending_invite(t uuid)` (schema.sql:184-191 / migration 02) — SECURITY DEFINER; true if a pending invite matches `auth.jwt()->>'email'`.
- `is_admin()` (03:85-91) — SECURITY DEFINER; true if caller's profile has is_admin.
- `handle_new_user()` + trigger `on_auth_user_created` (03:50-66) — auto-creates a profile row on signup.
- `guard_profile_admin_flag()` + trigger `profiles_guard_admin` (03:276-290) — blocks a normal user from flipping their own `is_admin`; plus `revoke update(is_admin) ... from authenticated`.

### RLS policies (all tables have RLS enabled)
- **trips**: select = owner OR `can_access_trip(id)`; insert = owner only; **update = any member** (`can_access_trip`, so a partner can edit the shared doc); delete = owner only.
- **trip_members**: select = anyone on trip; insert = owner adds anyone, OR an invitee adds **themselves** if `has_pending_invite`; delete = owner, or you can remove yourself.
- **trip_invites**: select = trip members OR the addressed invitee (by email); insert = member with `invited_by=auth.uid()`; update (revoke/accept) = member OR addressed invitee.
- **child tables** (segments/stays/transport/extras/notes/ledger): full `for all` access when `can_access_trip(trip_id)`.
- **catalogue** (countries/cities/catalogue_fields): SELECT = any **authenticated** user (`to authenticated using(true)` — deliberately NOT anon, to avoid scraping); write = admins only via `is_admin()`.
- **profiles**: select own or admin; update own or admin (but is_admin protected by trigger); no insert/delete policy (denied).

### How trip membership/sharing works TODAY
Owner + `trip_members` (editor/viewer) share a single trip row. Invites: owner inserts a `trip_invites` row by email; invitee signs in with that email (magic link), and RLS lets them insert **only themselves** into `trip_members`, then flips the invite to accepted. **Entirely client + anon key + RLS — no server, no service_role.** (Static app implements this in `js/cloud.js`.)

### `trips.state` / `trips.ledger` structure
`state` = the app's full `DEFAULT_STATE` document (see §4). `ledger` = array of `{id, date, type, category, amount, currency, note}` rows (matches the normalized `ledger` table columns). Written by `cloudPush()` in `js/cloud.js` as `{state, ledger, name, updated_at}`.

---

## 2. `DATABASE.md` + `README.md`

**`DATABASE.md`** (setup checklist) — Supabase free plan; create project → run `schema.sql` → enable Email/Apple/Google auth → grab URL + anon key (service_role never committed) → in-app invite flow → run migration 01 (document sync) + 02 (invites). Documents the sync model and its **known v1 limitation**: *"Sync is last-write-wins on the whole document... if you edit offline then open online, the cloud version can overwrite offline edits. A future pass can add live realtime updates + smarter merging."*

**`README.md`** — describes the static app: itinerary + auto-budget in HUF + monthly earn-target + 3D globe route map + income/profit ledger + 37-city KB. Tabs: Overview, Timeline, Map, Stays, Transport, Budget, Monthly, Money, Knowledge Base, Data, Settings. Money ledger row shape "matches the Supabase `ledger` table, so it migrates cleanly." Roadmap points to `docs/ARCHITECTURE.md` for the multi-user product.

---

## 3. `docs/ARCHITECTURE.md` — written-down future plans/decisions

**Status: "plan, not built."** The migration target for turning the personal planner into a multi-user product.

- **Stack chosen:** Next.js (App Router) + Supabase + Vercel, Tailwind + shadcn/ui, TanStack Query, `globe.gl` (client-only), Stripe later. (Alternatives Nuxt/Angular/custom Node explicitly rejected with reasons.)
- **Data model split:** shared catalogue (cities, countries, optional `route_prices`, optional live `hazards`) = admin-write / authenticated-read; private per-user (trips, trip_members, trip_invites, segments/stays/transport/extras/notes, ledger) = owner/members via `can_access_trip()`.
- **Key stated change:** move OFF the single JSON blob (`trips.state`/`trips.ledger`) TO the **normalized tables** "so we can query, filter, and do realtime per-row. The document columns can be dropped once migrated."
- **Server-side bits planned:** flight prices (paid API, server-only), live typhoon/cyclone proxy+cache, Stripe webhooks, admin bulk imports. USGS quakes stay client-side.
- **Component mapping:** each `view*()` → a route component; `cloud.js` → typed Supabase data layer; `map.js` → `<Globe>`.
- **Phased migration:** Phase 0 scaffold → Phase 1 shared catalogue + KB/Map → Phase 2 normalized private trips → Phase 3 product shell (landing/pricing/Stripe/Apple-Google login) → Phase 4 server data proxies + admin editor.
- **Open decisions (§5, directly relevant to social features):** free vs paid tiers (collaborators possibly paid); catalogue editing internal-only **vs community contributions with moderation**; **Realtime — "live co-editing for shared trips (Supabase Realtime) — nice-to-have"**; mobile responsive-first then PWA; i18n (EN now, maybe HU).

Note: there is **no written plan yet** for public ratings/comments, live trip-following by family, or photo/video — those are net-new. The closest existing hooks: `trip_members` viewer role, `cities.owner`+`is_public` user-contributed-cities idea (§1.4 of ARCHITECTURE), and the "community contributions with moderation" open question.

---

## 4. Trip state document shape (static app)

Data loading: `js/init.js` (bottom) fetches `cities.json`, calls `applyData()` in `js/data.js`, then `init()`. Trip state lives in `localStorage` key **`asiaNomadPlanner_v1`** (`js/core.js:2`).

**`DEFAULT_STATE`** (`js/data.js:22-53`) top-level keys:
- **`meta`** — `{version, tripName, travelers, baseCurrency:"HUF", budgetCap, startDate}`. Also accumulates one-time migration flags at runtime (`_inj_beijing`, `_plan_sept`, `_plan_extend`, `_plan_budget`, `_plan_south`, `_plan_hanoi`, `_plan_north`, `_plan_opt`, `_plan_2027`, `_plan_weather`, `_sh_hotel`, etc. — see `js/init.js`, a long chain of idempotent state migrations).
- **`rates`** — currency→HUF map (HUF:1, USD:311, EUR:354, THB, VND, IDR, MYR, SGD, KHR, JPY, KRW, TWD, HKD, CNY, INR, NPR, LKR).
- **`segments`** — trip stops: `{id, country, city, arrive, depart, tier, color, notes, include?, weather?}`.
- **`stays`** — lodging: `{id, segId, name, platform, url, cur, ppn, nights, rating, status ('idea'|'shortlist'|'chosen'/'booked'), notes, include?}`. (`rating` = hotel review score, not a social feature.)
- **`transport`** — `{id, type, from, to, date, provider, url, cur, price, status, notes, include?}`.
- **`extras`** — `{id, label, cur, amount, category, include?}`.
- **`notes`** — `{ [city]: text }` per-city free text.

**Income ledger** (separate from state) — `js/money.js:5`, localStorage key **`asiaNomadLedger_v1`**, own `income.json` export. Row shape: `{id, date:"YYYY-MM-DD", type:"income"|"expense", category, amount, currency, note}`.

**`cities.json` shape** (top-level: `meta`, `countries`, `cities`):
- `meta`: `{version, generated, note}`
- `countries`: map keyed by English name → `{visa, bestTime, safety}`
- `cities`: array of `{region ("SE"/"EA"/"SA"/"EU"), country, city, lat, lng, costs:{allInDayMid:[lo,hi], accomPerNight:{budget,mid,nice}, rentMonthly, dailyLiving:{low,mid,high}}, food, transport, internet, landmarks:[{name,why,when,how,cost,time}], weather:{hazard, months:[{m,hi,lo,rain} ×12]}}`. README documents this at README.md:107-129. (`js/data.js applyData()` remaps to short keys internally: r, allIn, accom, rent, live, meals, transit, net, land, weather.)

---

## 5. `supabase/config.js` (committed)

Contains **public values only** (intentionally committed — RLS is the security boundary):
- `window.SUPABASE_URL = "https://wvmnudcwcqktcugouqoe.supabase.co"`
- `window.SUPABASE_ANON_KEY = "eyJ...q5XSLB65mYCg8kcgj00Fvp6WDUGNWxEmpBd166z-eZM"` (anon role JWT, iat 1782586106 / exp 2098162106)
- Header comment: never put service_role here; delete/blank the file to fall back to local-only.

---

## 6. `tools/` scripts

- `tools/add-coords.mjs` — idempotent Node script; fills `lat`/`lng` on every city in `cities.json` from a hardcoded `COORDS` table (WGS84 city-centre approximations). `--force` overwrites. Run via `npm run coords`.
- `tools/seed-catalogue.mjs` — reads `cities.json` and **upserts into `public.countries` + `public.cities`** via `@supabase/supabase-js` using the **SERVICE_ROLE key** (bypasses RLS; trusted local/CI only). Idempotent upsert on natural keys. Includes a `CURRENCY`/ISO-2 map lifted from `js/map.js` COUNTRY_META. Run after migration 03. (README/product docs note the SQL Editor route as the easier no-terminal alternative.)

---

## 7. Existing sharing / follow features

**What exists today (in `js/cloud.js`, backed by RLS):**
- Magic-link email auth (`signInWithOtp`), document-model sync to `trips.state`/`trips.ledger`, debounced ~1.2s push, last-write-wins.
- **Invite by email** → `cloudInviteSend()` inserts into `trip_invites` (role editor/viewer).
- **Accept invite** → `cloudAcceptInvite()` self-inserts into `trip_members` then marks invite accepted.
- **Revoke** (`cloudRevokeInvite`), **incoming-invite badge** (`cloudCheckIncoming`/`cloudRenderIncoming`), **trip switcher** across all accessible trips (`cloudRenderTrips` / `setActiveTrip`, localStorage `asiaNomadActiveTrip`).
- Roles: **editor** (can edit) and **viewer** (read-only) — defined in the invite UI dropdown and enforced only structurally (both currently get full row access under the child-table RLS via `can_access_trip`; the viewer restriction is not yet separately enforced in RLS beyond the role label).

**What does NOT exist (all net-new for the planned social features):**
- No **public / anonymous** access to any trip or catalogue (catalogue is authenticated-only; trips are owner/member-only). No share-links / public URLs / viewer tokens.
- No **follow** relationship, no live trip-following, no activity feed.
- No **ratings** (the `stays.rating` field is a hotel score) or **comments** tables anywhere.
- No **photo/video** / storage buckets referenced (Supabase Storage not used; only vendored globe textures + a countries geojson under `product/public/vendor/`).
- No **Realtime** subscriptions yet — sync is polling/load-on-open, last-write-wins. Realtime co-editing is listed only as a "nice-to-have" open decision in `docs/ARCHITECTURE.md`.

**Note on the `product/` Next.js app** (non-`src` files read): `product/README.md` confirms the built slice = auth (magic-link) + dynamic `/knowledge` catalogue + `/map`; open registration via `signInWithOtp` (any email creates an account). It uses migrations 03/04 and `NEXT_PUBLIC_SUPABASE_*` env vars (`product/.env.example`). No social/follow/media code in the product's non-src files. `product/AGENTS.md` only contains a Next.js-version warning; `product/CLAUDE.md` just includes `@AGENTS.md`.