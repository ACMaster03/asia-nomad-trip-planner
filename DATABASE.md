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

(If you run the latest `schema.sql` fresh instead, it already includes these.)

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
