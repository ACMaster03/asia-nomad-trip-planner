# Asia Nomad Trip Planner

A self-contained trip planner + knowledge base for a long Asia nomad trip. Tracks an
itinerary (timeline, stays, flights), an auto-calculating budget in HUF, a monthly
spending / earn-target view, a **3D globe route map**, an **income/profit ledger**,
and a 37-city knowledge base with costs, transport, landmarks, visas, **month-by-month
weather**, and **coordinates**.

## Files

| File | What it is |
|------|------------|
| `index.html` | The whole app (HTML + CSS + JS, no build step). Works **offline** (double-click) and **served** (Vercel / local server). |
| `cities.json` | The **single source of truth** for reference data — all 37 cities + 16 countries: costs, food, transport, landmarks, visas, 12-month climate, lat/lng. Edit this, then run `npm run embed`. |
| `vendor/` | Vendored, offline-safe assets (the 3D globe library + earth texture). Committed on purpose — see `vendor/README.md`. |
| `tools/` | Maintenance scripts: `embed.js` (sync the offline data snapshot) and `add-coords.mjs` (city coordinates). |
| `supabase/schema.sql` | Forward-looking database schema for the optional sync/multi-user upgrade. |
| `DATABASE.md` | Step-by-step Supabase setup (only needed if/when you want cross-device sync). |
| `README.md` | This file. |

## Tabs

Overview · Timeline · **Map** (3D globe of your route) · Stays · Transport · Budget ·
Monthly (earn-target) · **Money** (income/expense P&L) · Knowledge Base · Data · Settings.

### Map
A 3D globe (no API key, no internet, no Google Maps) showing every knowledge-base city,
with glowing arcs tracing your itinerary in date order. The globe library is vendored in
`vendor/` and loaded only when you open the Map tab.

### Money
Log what you actually **earn** and **spend** to see a month-by-month **profit/loss** next
to your planned spend. Stored separately from the trip — its own browser storage and its
own `income.json` (Export/Import), plus CSV export. The row shape matches the Supabase
`ledger` table, so it migrates cleanly later.

## Maintaining the data (one source of truth)

`cities.json` is the source of truth. `index.html` carries an **embedded copy** so the
offline (double-click) file works with no server. Keep them in sync with one command —
never hand-edit the embedded copy:

```bash
npm run embed     # regenerate the embedded snapshot in index.html from cities.json
npm run coords    # (re)apply city coordinates to cities.json
npm run sync      # coords + embed in one go
```

## How the data loads (offline vs served)

`index.html` ships with an **embedded snapshot** of the data, so opening the file
directly (no server) always works — great on the road with no internet.

When the page is **served over http(s)** (local server or Vercel) it additionally
does `fetch('cities.json')` and uses that, so the deployed site always reflects the
latest store. In short:

- **Offline (double-click `index.html`)** → uses the embedded snapshot.
- **Served (Vercel / local server)** → uses `cities.json` (live, editable without touching the app).

> Your **itinerary/trip data** (stops, stays, flights, budget toggles) is saved in the
> browser's `localStorage`, not in `cities.json`. Use the in-app **Export / Import**
> buttons to back it up or move it between devices / between you and your travel partner.

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

> Note: the offline `index.html` carries an embedded snapshot of this data. After editing
> `cities.json`, the **served** site updates immediately; to refresh the **offline** file's
> embedded copy, run **`npm run embed`** (it rewrites the `EMBEDDED_DATA` block for you — no
> hand-editing). New cities also need coordinates: add them to `tools/add-coords.mjs` and
> run `npm run sync`.

## Roadmap ideas

- **Sync / multi-user** via Supabase (auth + Postgres) — schema and setup are ready in
  `supabase/schema.sql` + `DATABASE.md`; keep localStorage as the offline cache.
- Split `cities.json` per region if it grows.
- Add a real weather/forecast API for the active trip dates.
