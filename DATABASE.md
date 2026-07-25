# Database setup (Supabase) — what *you* need to do

The app works today with **no database** — your trip lives in the browser and your
income ledger exports to `income.json`. You only need this when you want the trip +
ledger to **sync automatically** between your phones / laptops and between you and
your girlfriend, instead of passing files around.

This doc is the checklist for standing up the (free) database. The schema is in
[`supabase/schema.sql`](supabase/schema.sql). Wiring the app to it is the last,
optional step — everything before it is safe and reversible.

> **Cost:** Supabase's Free plan is $0/month and fits two people with enormous room
> to spare (50,000 auth users, 500 MB DB, 1 GB storage). The one catch: a free
> project **pauses after 7 days of no activity** — you click "Restore" and it's back
> in a minute. No time limit otherwise; it's free indefinitely at this size.

---

## Step 1 — Create the project (5 min)

1. Go to **https://supabase.com** → sign in (GitHub login is easiest).
2. **New project**. Pick a name (e.g. `asia-nomad`), a strong **database password**
   (save it in your password manager), and the region closest to you
   (e.g. *Central EU (Frankfurt)*).
3. Wait ~2 minutes for it to provision.

## Step 2 — Create the tables (2 min)

1. In the project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/schema.sql` from this repo, copy the **whole file**, paste it in.
3. Click **Run**. You should see "Success". (Re-running it later is safe.)
4. Check **Table Editor** — you'll see `trips`, `segments`, `stays`, `transport`,
   `extras`, `notes`, `ledger`, `trip_members`, `cities`.

## Step 3 — Turn on login (5 min)

1. **Authentication → Providers**.
2. Enable **Email** (works out of the box).
3. For one-tap login, also enable **Apple** and/or **Google**. Apple is on your
   launch shortlist — it needs an Apple Developer account and a Services ID +
   key; Supabase's screen lists the exact fields. (You can skip this now and add
   it later; Email is enough to start.)
4. **Authentication → URL Configuration**: add your site URLs to **Redirect URLs** —
   `http://localhost:4321` for local dev and your Vercel URL
   (`https://asia-nomad-trip-planner.vercel.app`) for production.

## Step 4 — Grab your keys (1 min)

**Project Settings → API.** You need two values:

| Value | Where it goes | Secret? |
|-------|---------------|---------|
| **Project URL** (`https://xxxx.supabase.co`) | front-end | no — safe in client code |
| **anon public key** | front-end | no — safe in client code (RLS protects data) |
| **service_role key** | nowhere in this app | 🔴 **YES — never commit it / never ship to the browser** |

The app is a static site, so it only ever uses the **URL + anon key**. Row Level
Security (set up by the schema) is what keeps each user's data private even though
the anon key is public.

## Step 5 — Invite your girlfriend (in-app, no SQL)

Sharing is now built into the app — no manual SQL needed:

1. You: open the **☁** dialog (top bar) → **Invite someone** → enter her email → **Send invite**.
2. She: opens the site and signs in with **that same email** (magic link). A banner
   appears in her ☁ dialog: **"You've been invited…"** → **Accept & switch**.
3. Done — you both edit the same trip + ledger. The ☁ dialog also lists all trips you
   can access, so you can switch between "your" trip and a shared one.

> Under the hood this uses a `trip_invites` table + RLS: the invite is recorded by email,
> and when she signs in the app lets her add *herself* to the trip (and nothing else).
> Requires **migration 02** below.

---

## Step 6 — Run the sync migration (required, 1 min)

The app is **already wired** to Supabase (vendored client + `supabase/config.js`). It
uses a simple, reliable **document model**: your whole trip `state` and the income
`ledger` are stored as JSON on one row in the `trips` table. That needs two columns
and one policy tweak. In **SQL Editor**, run
[`supabase/migrations/01-document-sync.sql`](supabase/migrations/01-document-sync.sql)
(or paste it):

```sql
alter table public.trips add column if not exists state  jsonb not null default '{}'::jsonb;
alter table public.trips add column if not exists ledger jsonb not null default '[]'::jsonb;
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update using (public.can_access_trip(id));
```

Then run [`supabase/migrations/02-invites.sql`](supabase/migrations/02-invites.sql) too —
it adds the `trip_invites` table + policies that power the in-app **Invite** flow (Step 5).

(If you run the latest `schema.sql` fresh instead, it already includes everything.)

Also double-check **Authentication → URL Configuration → Redirect URLs** contains the
URL you actually open the app from — `http://localhost:4321` for local and your Vercel
URL for production — or the magic-link won't return you to the app.

## How sync works now

- Click **☁ Sign in** (top bar) → enter email → open the magic link on that device.
- On sign-in the app **loads your trip + ledger from the cloud**. First time (empty
  cloud) it seeds the cloud from whatever is in your browser.
- Every change saves locally **and** pushes to the cloud (debounced ~1s). The button
  shows `✓` synced, `⟳` syncing, or `⚠` error.
- **Offline / double-clicked file:** no cloud, app works local-only — sign-in is only
  available on the served site.
- **Sharing:** see Step 5 — your partner signs in once, you add them as a `trip_member`,
  and you both edit the same trip. Their ids are shown in the ☁ dialog for convenience.

### Known limitation (v1)
Sync is **last-write-wins on the whole document**, and the cloud copy loads when you
open the app. Fine for two people coordinating loosely; but if you edit **offline** and
then open the app **online**, the cloud version can overwrite those offline edits. Use
**Export** for a safety backup before big offline sessions. (A future pass can add live
realtime updates + smarter merging.)

---

### Security reminders
- ✅ Project URL + **anon** key in client code is fine — that's their purpose.
- 🔴 The **service_role** key bypasses all security — keep it out of the repo and
  out of the browser. (It's not needed for this app.)
- ✅ `.gitignore` already excludes `.env*` and `.vercel` so local secrets don't get
  committed.

## Adding a country fact (migration 22)

Country facts live in `countries.extras` jsonb and are declared in
`catalogue_fields` with `source = 'country_attribute'` — the same data-driven
path city facts use. **No migration and no deploy is needed for a new fact.**

Declare it once:

```sql
insert into catalogue_fields (key, label, field_group, type, source, sort_order, show_in_list)
values ('dress_code', 'Temple dress code', 'Country', 'text', 'country_attribute', 79, false);
```

Then fill it per country:

```sql
update countries
   set extras = extras || jsonb_build_object('dress_code', 'Shoulders and knees covered.')
 where code = 'Thailand';
```

Fields with no value render nothing at all (`FieldRenderer` returns null), so a
declared-but-unfilled field is invisible rather than an empty row. Dotted keys
work for nested structures, exactly as with `cities.attributes`
(e.g. `'sim.providers'`).

Migration 22 ships five starter definitions with NO values — plugs, tipping,
tap_water, sim, emergency. The content is editorial and deliberately left to the
owner; verify anything safety-related before relying on it.

## GeoNames world layer (migration 23)

`geo_cities` (34 043 cities, population > 15 000) and `geo_countries` (252, with
capitals) are the Tier-2 world layer. **Attribution is required**: data from
[GeoNames](https://www.geonames.org), CC BY 4.0 — credited in the Explore UI.

They are deliberately SEPARATE from `public.cities`, which stays the curated
46-row editorial catalogue. `fetchCityList()` still downloads only those 46
(~8 kB); the world layer is reachable only through `search_cities()`.

To refresh the import:

```bash
cd /tmp
curl -sLO https://download.geonames.org/export/dump/cities15000.zip
curl -sLO https://download.geonames.org/export/dump/countryInfo.txt
unzip -o cities15000.zip
python3 tools/import-geonames.py /tmp
```

then per environment:

```sql
truncate public.geo_cities;
truncate public.geo_countries cascade;
\copy public.geo_countries from '/tmp/geo_countries.csv' csv header
\copy public.geo_cities    from '/tmp/geo_cities.csv'    csv header
```

`geo_cities.id` is a GEONAMEID — a different id space from `cities.id`. Rows
where `search_cities` returns `in_catalogue = false` must never be passed to
`fetchCityDetail`.

## OSM attractions (migration 24)

`geo_places` is the Tier-2 world attraction layer: `tourism=attraction|museum|
viewpoint|artwork|zoo|theme_park|gallery`, name required, ways and relations
reduced to a centre point. **Attribution is required**: © OpenStreetMap
contributors, ODbL 1.0 — credited in the Explore UI. Note ODbL's SHARE-ALIKE
clause, which is stronger than GeoNames' CC BY and matters for the P3 community
phase.

Restaurants are deliberately NOT imported. Measured 2026-07-25: Thailand has
19 456 `amenity=restaurant` nodes against 2 781 `tourism=attraction`, and a
restaurant with no hours, photos or reviews is weaker than a map app.

Refresh (resumable — a country whose CSV exists is skipped, so a rate-limit just
means running it again):

```bash
python3 tools/fetch-osm-attractions.py /tmp/osm          # all trip countries
python3 tools/fetch-osm-attractions.py /tmp/osm CN IN    # just the stragglers
```

then per environment:

```sql
truncate public.geo_places;
\copy public.geo_places from '/tmp/osm/geo_places.csv' csv header
```

`search_places` returns a TEXT id: a uuid for `public.places`, `"way/12345"` for
an OSM row. `in_catalogue = false` rows must never be treated as a `places.id`.

### Overpass gotchas (learned the hard way, 2026-07-25)

* **A 200 response is not success.** Overpass answers HTTP 200 with a `remark`
  field when a query exhausts its time or memory budget. Treating that as "no
  results" is why China and India first looked like empty countries rather than
  failed ones. The fetcher now raises on `remark`.
* **`admin_level=2` does not match SARs.** Hong Kong and Macau are not
  country-level areas in OSM, so the usual selector matched nothing and returned
  a valid, empty result. `NO_ADMIN_LEVEL` in the fetcher drops the filter for
  those.
* **504s are routine** for large countries; the backoff usually gets there.
* **Some countries never fit in one query.** China and India fail with
  `Query timed out after 181 seconds` no matter how often you retry. They are
  listed in `TILED` and fetched as a 3x3 grid of bbox tiles INTERSECTED with the
  country area — the area filter stays, so tiles never pick up a neighbour's
  POIs, and results are de-duplicated because a way can straddle two tiles. If
  even tiles fail, raise `TILE_GRID` or fall back to a Geofabrik extract with
  osmium.
* **China's OSM area includes Hong Kong and Macau.** CN's tiles therefore
  capture their POIs too, and whichever country is merged first wins the label —
  merging CN first silently relabelled all 620 HK rows as CN. The merge now
  orders SARs before their parent country.
