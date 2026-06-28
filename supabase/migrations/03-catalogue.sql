-- ============================================================================
-- 03-catalogue.sql — Admin-curated, ADMIN-EXTENSIBLE shared knowledge base
-- ============================================================================
-- Goal: an admin can add (a) a whole new CITY and (b) a brand-new ATTRIBUTE
-- FIELD with ZERO frontend code changes. The frontend renders cities by reading
-- `catalogue_fields` (metadata: what fields exist, how to label/group/render
-- them) and pulling each field's value from `cities.attributes` (jsonb).
--
-- Tables: profiles, countries, cities, catalogue_fields.
-- Helper: public.is_admin()  (SECURITY DEFINER — mirrors can_access_trip()).
--
-- Idempotent: create-or-replace / if-not-exists / drop-policy-if-exists.
-- HOW TO APPLY: Supabase SQL Editor -> paste -> Run. Safe to re-run.
-- NOTE: This SUPERSEDES the draft per-user public.cities table in schema.sql.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0) RECONCILE the draft per-user public.cities (from schema.sql) -> shared
--    catalogue. schema.sql created public.cities as (data jsonb, is_public,
--    owner). `create table if not exists` below would be a NO-OP against that
--    table, so the seed (attributes column / (country,city) upsert) would fail.
--    Drop the DRAFT shape first — guarded on the `owner` column so this only
--    ever fires on the draft, never on a real catalogue. (The draft was unused.)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cities' and column_name = 'owner'
  ) then
    drop table public.cities cascade;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 1) PROFILES — one row per auth user; carries the is_admin flag.
--    Auto-created on signup by a trigger on auth.users.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is created.
-- SECURITY DEFINER so the trigger can insert regardless of the caller's RLS.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that already existed before this migration.
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- HOW is_admin GETS SET: manually, by you, in the SQL Editor / Studio. There is
-- no self-serve path to admin (a user can never set their own flag — see RLS).
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');


-- ---------------------------------------------------------------------------
-- is_admin() helper — SECURITY DEFINER so RLS policies on profiles/catalogue
-- can call it WITHOUT recursing into profiles' own RLS (same pattern as the
-- existing public.can_access_trip()). Defaults to false for anon (auth.uid() null).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin
  );
$$;


-- ---------------------------------------------------------------------------
-- 2) COUNTRIES — admin-curated. Known queried columns + jsonb `extras`.
--    `code` is our stable key (we use the English country name, matching
--    cities.json keys, e.g. 'Thailand'); iso2/currency are nullable and an
--    admin fills them later (they are NOT in cities.json today).
-- ---------------------------------------------------------------------------
create table if not exists public.countries (
  code       text primary key,             -- e.g. 'Thailand'  (matches cities.json)
  name       text not null,                -- display name (usually == code)
  iso2       text,                          -- 'TH' — fill later
  currency   text,                          -- 'THB' — fill later
  visa       text,
  best_time  text,
  safety     text,
  extras     jsonb not null default '{}'::jsonb,  -- any future country field
  updated_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 3) CITIES — admin-curated shared catalogue.
--    STRUCTURED columns = only the fields we sort/filter/query/map by.
--    Everything else (food, transport, internet, landmarks, weather, AND any
--    FUTURE field) lives in `attributes` jsonb so new fields need NO migration.
-- ---------------------------------------------------------------------------
create table if not exists public.cities (
  id              bigint generated always as identity primary key,
  -- stable natural key so re-seeding upserts instead of duplicating:
  country         text not null references public.countries (code) on update cascade,
  city            text not null,
  -- queried / sortable / map columns (denormalized for performance & RLS-free sort):
  region          text,                    -- 'SE' | 'EA' | 'SA'
  region_name     text,
  lat             double precision,
  lng             double precision,
  daily_living_mid numeric,                 -- costs.dailyLiving.mid  (sort/filter)
  accom_mid       numeric,                  -- costs.accomPerNight.mid (sort/filter)
  rent_monthly    numeric,                  -- costs.rentMonthly       (sort/filter)
  -- EVERYTHING else, including all future fields:
  attributes      jsonb not null default '{}'::jsonb,
  sort_order      int,                       -- optional manual ordering in lists
  updated_at      timestamptz not null default now(),
  unique (country, city)
);

create index if not exists cities_country_idx     on public.cities (country);
create index if not exists cities_region_idx       on public.cities (region);
create index if not exists cities_daily_living_idx on public.cities (daily_living_mid);
-- GIN so the frontend / admins can query inside attributes (e.g. has a field):
create index if not exists cities_attributes_gin   on public.cities using gin (attributes);


-- ---------------------------------------------------------------------------
-- 4) CATALOGUE_FIELDS — the metadata that DRIVES the dynamic frontend.
--    The UI reads this table to know which fields exist, their label, which
--    visual group/section they belong to, how to render them (type), their
--    unit, ordering, and whether to show them in the compact list/card view.
--    Adding a row here + putting the value in cities.attributes = a new field
--    appears in the UI with zero code change.
--
--    `source` tells the frontend WHERE to read the value from:
--      'attribute'  -> cities.attributes ->> key   (the default, extensible path)
--      'column'     -> a structured cities column named `key` (the known fields)
--      'country'    -> countries column/extras (joined by city.country)
--    `type` drives the renderer:
--      'text'   -> string
--      'number' -> single numeric (use `unit`)
--      'range'  -> [lo, hi] array  (e.g. allInDayMid)
--      'list'   -> array of objects (e.g. landmarks) rendered via item_fields
--      'object' -> nested object   (e.g. weather, costs sub-objects)
--    `item_fields` (jsonb) optionally describes sub-fields of a list/object so
--    the frontend can render nested structures generically too.
-- ---------------------------------------------------------------------------
create table if not exists public.catalogue_fields (
  key          text primary key,           -- e.g. 'food', 'landmarks', 'rent_monthly'
  label        text not null,              -- human label, e.g. 'Food & drink'
  field_group  text not null default 'General',  -- UI section, e.g. 'Costs','Weather'
  type         text not null check (type in ('text','number','range','list','object')),
  source       text not null default 'attribute'
                 check (source in ('attribute','column','country')),
  unit         text,                        -- '$', '$/night', 'mm', '°C', '/mo'
  sort_order   int  not null default 100,
  show_in_list boolean not null default false,  -- show in compact card/list view?
  item_fields  jsonb,                        -- sub-field descriptors for list/object
  updated_at   timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 4b) Seed catalogue_fields describing the CURRENT cities.json fields.
--     (Idempotent upsert.) This is the contract the frontend renders against.
-- ---------------------------------------------------------------------------
insert into public.catalogue_fields (key, label, field_group, type, source, unit, sort_order, show_in_list, item_fields) values
  -- ---- structured columns (source='column') -------------------------------
  ('region',           'Region',              'Overview', 'text',   'column',    null,        10, true,  null),
  ('region_name',      'Region name',         'Overview', 'text',   'column',    null,        11, false, null),
  ('country',          'Country',             'Overview', 'text',   'column',    null,        12, true,  null),
  ('city',             'City',                'Overview', 'text',   'column',    null,        13, true,  null),
  ('lat',              'Latitude',            'Map',      'number', 'column',    '°',         20, false, null),
  ('lng',              'Longitude',           'Map',      'number', 'column',    '°',         21, false, null),
  ('daily_living_mid', 'Daily living (mid)',  'Costs',    'number', 'column',    '$/day',     30, true,  null),
  ('accom_mid',        'Accommodation (mid)', 'Costs',    'number', 'column',    '$/night',   31, true,  null),
  ('rent_monthly',     'Rent (1-BR furn.)',   'Costs',    'number', 'column',    '$/mo',      32, true,  null),
  -- ---- jsonb attributes (source='attribute') ------------------------------
  -- nested cost ranges/objects kept under attributes.costs.* — describe the
  -- ones the UI shows beyond the three sortable scalars above:
  ('costs.allInDayMid',          'All-in / day (mid)',  'Costs', 'range',  'attribute', '$',      33, true,  null),
  ('costs.accomPerNight',        'Accommodation tiers', 'Costs', 'object', 'attribute', '$/night',34, false,
     '[{"key":"budget","label":"Budget"},{"key":"mid","label":"Mid"},{"key":"nice","label":"Nice"}]'::jsonb),
  ('costs.dailyLiving',          'Daily living tiers',  'Costs', 'object', 'attribute', '$/day',  35, false,
     '[{"key":"low","label":"Low"},{"key":"mid","label":"Mid"},{"key":"high","label":"High"}]'::jsonb),
  ('food',             'Food & drink',        'Living',   'text',   'attribute', null,        40, false, null),
  ('transport',        'Local transport',     'Living',   'text',   'attribute', null,        41, false, null),
  ('internet',         'Internet & coworking','Living',   'text',   'attribute', null,        42, false, null),
  ('landmarks',        'Landmarks',           'Things to do', 'list','attribute', null,        50, false,
     '[{"key":"name","label":"Name","type":"text"},
       {"key":"why","label":"Why","type":"text"},
       {"key":"when","label":"When","type":"text"},
       {"key":"how","label":"How to get there","type":"text"},
       {"key":"cost","label":"Cost","type":"text"},
       {"key":"time","label":"Time needed","type":"text"}]'::jsonb),
  ('weather',          'Weather',             'Weather',  'object', 'attribute', null,        60, false,
     '[{"key":"hazard","label":"Climate notes","type":"text"},
       {"key":"months","label":"Monthly normals","type":"list",
         "item_fields":[{"key":"m","label":"Month","type":"text"},
                        {"key":"hi","label":"High","type":"number","unit":"°C"},
                        {"key":"lo","label":"Low","type":"number","unit":"°C"},
                        {"key":"rain","label":"Rain","type":"number","unit":"mm"}]}]'::jsonb),
  -- ---- country-level fields (source='country', joined by city.country) -----
  ('visa',             'Visa',                'Country',  'text',   'country',   null,        70, false, null),
  ('best_time',        'Best time to visit',  'Country',  'text',   'country',   null,        71, false, null),
  ('safety',           'Safety',              'Country',  'text',   'country',   null,        72, false, null),
  ('currency',         'Currency',            'Country',  'text',   'country',   null,        73, true,  null)
on conflict (key) do update set
  label        = excluded.label,
  field_group  = excluded.field_group,
  type         = excluded.type,
  source       = excluded.source,
  unit         = excluded.unit,
  sort_order   = excluded.sort_order,
  show_in_list = excluded.show_in_list,
  item_fields  = excluded.item_fields,
  updated_at   = now();


-- ============================================================================
-- 5) ROW LEVEL SECURITY
--    Catalogue (countries, cities, catalogue_fields): readable by AUTHENTICATED
--    users (recommended — not anon: this is paid/curated data and you don't want
--    it scraped by unauthenticated bots). Writable only by admins.
--    profiles: a user sees/edits only their own row; admins see all.
-- ============================================================================
alter table public.profiles         enable row level security;
alter table public.countries        enable row level security;
alter table public.cities           enable row level security;
alter table public.catalogue_fields enable row level security;

-- ---- profiles ----
-- A user can read their own profile; admins can read any (needed for an admin
-- to find a user to promote). NOTE: is_admin() is SECURITY DEFINER so this does
-- NOT recurse into profiles' RLS.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());

-- A user may update their own profile, BUT must not be able to flip is_admin.
-- We block privilege escalation with a trigger (below) rather than in the policy,
-- because WITH CHECK cannot reference the row's OLD value.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- No client-side INSERT/DELETE on profiles: rows are created by the signup
-- trigger and removed by the auth.users cascade. (No insert/delete policy ->
-- denied for everyone under RLS.)

-- Anti-escalation: a non-admin cannot change their own is_admin flag.
create or replace function public.guard_profile_admin_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() then
    raise exception 'not allowed to change is_admin';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_admin on public.profiles;
create trigger profiles_guard_admin
  before update on public.profiles
  for each row execute function public.guard_profile_admin_flag();

-- ---- shared catalogue: read = any signed-in user, write = admins only ----
do $$
declare tbl text;
begin
  foreach tbl in array array['countries','cities','catalogue_fields']
  loop
    execute format('drop policy if exists %1$s_select on public.%1$s;', tbl);
    execute format('drop policy if exists %1$s_write  on public.%1$s;', tbl);
    -- SELECT: authenticated only (swap `to authenticated` for `to anon, authenticated`
    -- if you ever decide to expose the catalogue publicly).
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated using (true);',
      tbl);
    -- INSERT/UPDATE/DELETE: admins only.
    execute format(
      'create policy %1$s_write on public.%1$s for all to authenticated using (public.is_admin()) with check (public.is_admin());',
      tbl);
  end loop;
end $$;


-- ============================================================================
-- NOTE: the draft per-user public.cities from schema.sql is reconciled
-- automatically by the guarded DROP in section 0 at the top of this file.
-- ============================================================================
