# Asia Nomad Trip Planner

A self-contained trip planner + knowledge base for a long Asia nomad trip. Tracks an
itinerary (timeline, stays, flights), an auto-calculating budget in HUF, a monthly
spending / earn-target view, and a 37-city knowledge base with costs, transport,
landmarks, visas and **month-by-month weather**.

## Files

| File | What it is |
|------|------------|
| `index.html` | The whole app (HTML + CSS + JS, no build step). Works **offline** (double-click) and **served** (Vercel / local server). |
| `cities.json` | The **data store** — all 37 cities + 16 countries: costs, food, transport, landmarks, visas, 12-month climate. Edit this to manage the reference data. |
| `README.md` | This file. |

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
> embedded copy, re-embed it (ask Claude to rebuild, or paste the new JSON into the
> `EMBEDDED_DATA = …` line in `index.html`).

## Roadmap ideas

- Move trip data (itinerary) into the store / a small backend for multi-device sync.
- Split `cities.json` per region if it grows.
- Add a real weather/forecast API for the active trip dates.
