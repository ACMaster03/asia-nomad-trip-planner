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

## Step 5 — Invite your girlfriend (after she signs in once)

1. She opens the app and logs in once (creates her `auth.users` row).
2. Find her user id in **Authentication → Users**.
3. **SQL Editor**, run (replace the ids):
   ```sql
   insert into trip_members (trip_id, user_id, role)
   values ('<your-trip-id>', '<her-user-id>', 'editor');
   ```
   Now you both see and edit the same trip + ledger.

---

## Step 6 (later) — Point the app at the database

This is the only code change, and it's small because the app already isolates
its storage. Today these functions are the seam:

| App function (in `index.html`) | Today | After Supabase |
|--------------------------------|-------|----------------|
| `load()` / `save()` | read/write `localStorage` (trip) | read/write the `trips` + itinerary tables |
| `loadLedger()` / `saveLedger()` | read/write `localStorage` (ledger) | read/write the `ledger` table |

The table columns were chosen to match the JSON the app already produces, so the
mapping is direct (e.g. an `income.json` entry → one `ledger` row). Rough plan:

1. Add the client (no build step needed):
   ```html
   <script type="module">
     import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
     window.db = createClient('https://xxxx.supabase.co', 'YOUR_ANON_KEY');
   </script>
   ```
   > Note: an `esm.sh` import needs internet, so it breaks pure-offline
   > double-click use. Keep the localStorage path as the offline fallback, or
   > vendor supabase-js into `vendor/` like we did with globe.gl. The clean
   > design is **localStorage as the offline cache, Supabase as the sync layer.**
2. On login, load the trip + ledger from the DB into `state` / `ledger`.
3. On `save()` / `saveLedger()`, also upsert to the DB (debounced).
4. Keep Export/Import as the manual backup it already is.

When you're ready for Step 6, hand me this file and I'll wire it up.

---

### Security reminders
- ✅ Project URL + **anon** key in client code is fine — that's their purpose.
- 🔴 The **service_role** key bypasses all security — keep it out of the repo and
  out of the browser. (It's not needed for this app.)
- ✅ `.gitignore` already excludes `.env*` and `.vercel` so local secrets don't get
  committed.
