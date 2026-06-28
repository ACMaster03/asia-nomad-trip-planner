# Asia Nomad Trip Planner

A self-contained trip planner + knowledge base for a long Asia nomad trip. Tracks an
itinerary (timeline, stays, flights), an auto-calculating budget in HUF, a monthly
spending / earn-target view, a **3D globe route map**, an **income/profit ledger**,
and a 37-city knowledge base with costs, transport, landmarks, visas, **month-by-month
weather**, and **coordinates**.

## Files

> **Deployment:** this app is **served-only** (Vercel). `cities.json` is fetched live at
> load — there's no embedded snapshot to maintain. (Editing happens via the deployed
> project / repo, not by double-clicking the file.)

| File | What it is |
|------|------------|
| `index.html` | App shell (markup + CSS). Loads `js/*.js` in order; fetches `cities.json` at load. No build step. |
| `js/` | The app logic, split for maintainability — loaded as ordered plain scripts (shared global scope, so inline handlers keep working): `data` → `core` → `views` → `forms` → `cloud` → `map` → `money` → `io` → `init` (boot is last). |
| `cities.json` | The **single source of truth** for reference data — all 37 cities + 16 countries: costs, food, transport, landmarks, visas, 12-month climate, lat/lng. Edit this and redeploy. |
| `vendor/` | Vendored assets (3D globe library + earth texture, Supabase client). Committed on purpose so the app doesn't depend on a CDN — see `vendor/README.md`. |
| `tools/` | `add-coords.mjs` — manages city coordinates in `cities.json`. |
| `supabase/` | `schema.sql` + `migrations/` + `config.js` (public keys) for cloud sync. |
| `DATABASE.md` | Supabase setup steps. |
| `README.md` | This file. |

## Tabs

Overview · Timeline · **Map** (3D globe of your route) · Stays · Transport · Budget ·
Monthly (earn-target) · **Money** (income/expense P&L) · Knowledge Base · Data · Settings.

### Map
A 3D globe (no API key, no Google Maps) of your whole trip:

- **Numbered route** — your home base (⌂, the origin of the inbound flight, e.g. Budapest)
  then each stop numbered in order (1, 2, 3…).
- **Flight-aware arcs** — booked flights draw as bold gold solid arcs, estimates dashed;
  hover an arc for the price (from your transport data).
- **Click a country** → a panel with its flag, currency, visa policy, best time/safety,
  and its cities sorted cheapest→priciest by daily cost.
- **Rich city hover** — daily living, accommodation, rent, Wi-Fi, landmarks, weather.
- **Hazards toggle (⚡)** — live earthquakes (USGS, CORS-open feed; marker size = magnitude)
  + seasonal monsoon/typhoon risk for your cities this month, as pulsing rings. **Click any
  hazard** for details (magnitude/place/time + a safety note, or the rainfall/season note);
  an on-globe **legend** explains every marker.
- **Fullscreen** — the globe fills the page below the header; controls float on top and
  collapse into a **⚙ menu** on mobile. **Toggles** (spin, day/night, borders, hazards) are
  all remembered.

Globe library, textures and borders are vendored in `vendor/` and loaded on demand.
*Note: Hong Kong & Singapore are too small for the 110m borders dataset, so they aren't
separately clickable as countries.*

### Linkable tabs
Each tab has a URL hash — `…/#map`, `…/#budget`, `…/#money` — so you can bookmark or share
a specific view, and the browser back/forward buttons work.

### Money
Log what you actually **earn** and **spend** to see a month-by-month **profit/loss** next
to your planned spend. Stored separately from the trip — its own browser storage and its
own `income.json` (Export/Import), plus CSV export. The row shape matches the Supabase
`ledger` table, so it migrates cleanly later.

## Maintaining the data

`cities.json` is the single source of truth and is **fetched live** at page load — edit
it and redeploy (push to GitHub → Vercel rebuilds). No snapshot to regenerate.

```bash
npm run coords    # (re)apply city coordinates to cities.json (e.g. after adding a city)
```

When you add a new city, also add its coordinates to `tools/add-coords.mjs` and run the
command above.

## How the data loads

The deployed page does `fetch('cities.json')` on startup and renders from it, so the live
site always reflects the latest `cities.json`.

> Your **itinerary/trip data** (stops, stays, flights, budget toggles) and the **income
> ledger** live in `localStorage`, and — when signed in — sync to Supabase (see
> `DATABASE.md`). The in-app **Export / Import** buttons make manual backups.

## Run locally (served, picks up cities.json edits)

```bash
# from this folder:
npx serve .
#  – or –
python3 -m http.server 8080
```
Then open the printed `http://localhost:...` URL.

## Deploy to Vercel

It's a plain static site — no framework, no build.

1. Put this folder in a git repo (or use the Vercel CLI).
2. **CLI:** `npm i -g vercel` then run `vercel` in this folder and accept the defaults
   (Framework Preset: **Other**, Build Command: none, Output Directory: `./`).
3. **Dashboard:** import the repo on vercel.com → Framework Preset **Other** → Deploy.

`index.html` is served at `/` and `cities.json` next to it, so the fetch just works.

## Editing the data store

Edit `cities.json`. Each city looks like:

```json
{
  "region": "SE",
  "country": "Thailand",
  "city": "Bangkok",
  "costs": {
    "allInDayMid": [70, 110],
    "accomPerNight": { "budget": 25, "mid": 55, "nice": 150 },
    "rentMonthly": 600,
    "dailyLiving": { "low": 25, "mid": 40, "high": 65 }
  },
  "food": "…",
  "transport": "…",
  "internet": "…",
  "landmarks": [ { "name": "…", "why": "…", "when": "…", "how": "…", "cost": "…", "time": "…" } ],
  "weather": {
    "hazard": "best months / typhoon / monsoon notes",
    "months": [ { "m": "Jan", "hi": 32, "lo": 21, "rain": 15 }, … 12 entries Jan→Dec ]
  }
}
```

All money is approximate **USD** (mid-2026 estimates); the app converts to HUF using the
editable rates in **Settings**. Weather is climate normals: average daily high/low °C and
monthly rainfall in mm.

> Note: edit `cities.json` and redeploy — the live site fetches it on load, so changes
> show up immediately after the Vercel rebuild. New cities also need coordinates: add them
> to `tools/add-coords.mjs` and run `npm run coords`.

## Roadmap ideas

- **Multi-user product** (register, plan your own trip on a shared catalogue) — concrete
  plan in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): **Next.js + Supabase + Vercel**,
  shared vs per-user RLS, phased migration. Backend (schema/RLS/auth/invites) already built.
- **Sync / multi-user** via Supabase (auth + Postgres) — schema and setup are ready in
  `supabase/schema.sql` + `DATABASE.md`; keep localStorage as the offline cache.
- Split `cities.json` per region if it grows.
- Add a real weather/forecast API for the active trip dates.
