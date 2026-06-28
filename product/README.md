# Asia Nomad Planner — product app (Next.js)

The multi-user product version (Phase 0 + first slice), per [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
Next.js 16 (App Router) · React 19 · Tailwind 4 · Supabase (`@supabase/ssr`) · TanStack Query · globe.gl.

The old single-file static planner in the repo root is untouched and still works for the personal trip.

## What's here (first vertical slice)
- **Auth** — Supabase magic-link sign-in (`/login` → email → `/auth/confirm`), session via the Next 16
  `proxy.ts`, server-side guard on the `(app)` route group.
- **Shared knowledge base** (`/knowledge`) — cities rendered **dynamically** from the `catalogue_fields`
  metadata table + `cities.attributes` jsonb. **Adding a field or city is a DB-only change** — the UI
  reflects it with no code change (see *Extending the catalogue* below).
- **Map** (`/map`) — globe.gl in a client-only component plotting the catalogue cities (full route/hazard
  port from the static app's `js/map.js` is the next layer).

## Run locally
```bash
cd product
cp .env.example .env.local        # then fill NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev                        # http://localhost:3000
```
`.env.local` (gitignored) holds the **public** URL + anon key (RLS is the security boundary). Never put the
service_role key in any `NEXT_PUBLIC_` var or committed file.

## Database (one-time)
1. In Supabase SQL Editor, run [`../supabase/migrations/03-catalogue.sql`](../supabase/migrations/03-catalogue.sql)
   — creates `profiles` (+`is_admin`), `countries`, `cities`, `catalogue_fields`, RLS (catalogue readable by
   any signed-in user, writable only by admins via `is_admin()`), and seeds the field metadata. Idempotent.
2. Seed the catalogue from `cities.json`:
   ```bash
   SUPABASE_URL=https://wvmnudcwcqktcugouqoe.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role... \
   node ../tools/seed-catalogue.mjs        # upserts 16 countries + 37 cities
   ```
3. Make yourself an admin:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'you@example.com');
   ```
4. Auth → URL Configuration: add redirect URLs `http://localhost:3000/auth/confirm` (and `/auth/callback`),
   plus your deployed URLs. Point the magic-link email template at
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/knowledge`.

## Extending the catalogue (admin, zero code change)
- **Add a city:** one `cities` INSERT (structured columns + the rest in `attributes`). It appears immediately.
- **Add a brand-new field** (e.g. Air quality):
  ```sql
  insert into catalogue_fields (key,label,field_group,type,source,unit,sort_order,show_in_list)
  values ('air_quality','Air quality','Living','number','attribute','AQI',45,true);
  update cities set attributes = attributes || '{"air_quality":72}'::jsonb
  where country='Thailand' and city='Bangkok';
  ```
  Reload `/knowledge` — it renders, no deploy. Nested sub-fields (e.g. a `bookingUrl` on landmarks) are
  added by editing that field's `item_fields`; the generic list/object renderers pick them up.
- The **only** code change is a brand-new render *type* beyond text/number/range/list/object (add one
  renderer + a registry entry). Unknown types fail safe to text.

## Deploy (Vercel)
Separate Vercel project from the static app, **Root Directory = `product`**. Add `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars. Assign it its own subdomain.
