-- ============================================================================
-- 09-places.sql — the places table (M2 item 1, first of the "lived trip" regime)
--
-- AUTHORITY NOTE: 29-privacy-hardening.sql is the AUTHORITY for the places
-- policies and for uniqueness. It narrows places_select (user rows are NOT
-- world-readable — created_by made them an itinerary leak), re-asserts `source`
-- in places_update, and replaces the global unique (city_id, name) below with
-- two partial indexes. Re-running THIS file afterwards reopens both holes —
-- always (re)apply 29 last. If this file and 29 disagree, 29 wins.
--
-- Idempotent, additive-only. Design per the approved plan: places are BORN
-- relational (never jsonb) because every check-in hangs off one, and public
-- community reviews (P3) aggregate over them.
--
-- Seeding: the catalogue's cities.attributes->'landmarks' arrays are exploded
-- into rows below. Landmarks carry no coordinates (verified) — lat/lng stay
-- NULL until the geocode pass (tools/geocode-places, follow-up) fills them;
-- UI falls back to the city's own lat/lng for ungeocoded places.
-- ============================================================================

create table if not exists public.places (
  id         uuid primary key default gen_random_uuid(),
  city_id    bigint references public.cities (id) on delete set null,
  name       text not null,
  kind       text not null default 'landmark'
             check (kind in ('landmark','restaurant','cafe','activity','stay','transporthub','other')),
  lat        double precision,
  lng        double precision,
  source     text not null default 'catalogue' check (source in ('catalogue','user')),
  created_by uuid references auth.users (id) on delete set null,
  -- carried verbatim from the landmark entry: {why,how,cost,time,when,...}
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (city_id, name) -- makes the seed below idempotent
);

create index if not exists places_city_idx on public.places (city_id);

alter table public.places enable row level security;

-- World data, like the catalogue: any signed-in user reads everything.
drop policy if exists places_select on public.places;
create policy places_select on public.places for select
  to authenticated using (true);

-- "Add place here" (the /live check-in flow): any signed-in user may add a
-- USER place attributed to themselves. Catalogue rows come from privileged
-- contexts (seed below / admin tooling), never from clients.
drop policy if exists places_insert on public.places;
create policy places_insert on public.places for insert
  to authenticated
  with check (source = 'user' and created_by = auth.uid());

-- Corrections: creators fix their own places; admins fix anything.
drop policy if exists places_update on public.places;
create policy places_update on public.places for update
  to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists places_delete on public.places;
create policy places_delete on public.places for delete
  to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed: explode every city's landmarks into places rows. Re-runnable via an
-- explicit NOT EXISTS rather than ON CONFLICT: migration 29 replaces the
-- unique (city_id, name) constraint above with two partial indexes, and
-- ON CONFLICT (city_id, name) can no longer infer an index once it does. This
-- form is index-agnostic, so the seed stays idempotent both before and after 29.
-- ---------------------------------------------------------------------------
insert into public.places (city_id, name, kind, source, attributes)
select
  c.id,
  lm->>'name',
  'landmark',
  'catalogue',
  lm - 'name'
from public.cities c,
     jsonb_array_elements(coalesce(c.attributes->'landmarks', '[]'::jsonb)) lm
where lm ? 'name'
  and not exists (
    select 1 from public.places p
    where p.city_id = c.id and p.name = lm->>'name'
  );
