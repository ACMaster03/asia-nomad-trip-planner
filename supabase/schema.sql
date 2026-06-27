-- ============================================================================
-- Asia Nomad Trip Planner — Supabase schema (forward-looking)
-- ============================================================================
-- This is the database the app migrates TO when you want the trip + ledger to
-- sync automatically between devices / between you and your travel partner,
-- instead of living in each browser's localStorage.
--
-- Nothing in the app uses this yet — it's the target. The table shapes mirror
-- the JSON the app already produces (state export + income.json), so wiring it
-- up later is mostly "read/write these tables instead of localStorage".
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Safe to re-run: everything uses "if not exists" / "create or replace".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- TRIPS  (one row per trip; maps to the app's `state.meta` + `state.rates`)
-- ---------------------------------------------------------------------------
create table if not exists public.trips (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users (id) on delete cascade,
  name          text not null default 'Asia Nomad Trip',
  base_currency text not null default 'HUF',
  budget_cap    numeric,
  start_date    date,
  travelers     int  not null default 2,
  rates         jsonb not null default '{}'::jsonb,   -- { "USD": 311, ... }
  meta          jsonb not null default '{}'::jsonb,    -- migration flags etc.
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Sharing: who (besides the owner) can see/edit a trip. This is how you invite
-- your girlfriend — add her user id with role 'editor'.
create table if not exists public.trip_members (
  trip_id   uuid not null references public.trips (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'editor' check (role in ('editor','viewer')),
  added_at  timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- ---------------------------------------------------------------------------
-- ITINERARY  (maps to state.segments / stays / transport / extras)
-- Key fields are typed; anything else rides along in `extra` jsonb so the
-- schema doesn't break when the app adds a field.
-- ---------------------------------------------------------------------------
create table if not exists public.segments (
  id        text primary key,                 -- keep the app's ids (e.g. "sg_han")
  trip_id   uuid not null references public.trips (id) on delete cascade,
  country   text,
  city      text,
  arrive    date,
  depart    date,
  nights    int,
  tier      int,
  color     text,
  include   boolean not null default true,
  notes     text,
  weather   text,
  extra     jsonb not null default '{}'::jsonb,
  sort_at   timestamptz not null default now()
);

create table if not exists public.stays (
  id        text primary key,
  trip_id   uuid not null references public.trips (id) on delete cascade,
  seg_id    text,
  name      text,
  platform  text,
  url       text,
  currency  text,
  ppn       numeric,            -- price per night
  nights    int,
  rating    numeric,
  status    text,
  include   boolean not null default false,
  notes     text,
  extra     jsonb not null default '{}'::jsonb
);

create table if not exists public.transport (
  id        text primary key,
  trip_id   uuid not null references public.trips (id) on delete cascade,
  type      text,
  from_loc  text,
  to_loc    text,
  date      date,
  provider  text,
  url       text,
  currency  text,
  price     numeric,
  status    text,
  include   boolean not null default false,
  notes     text,
  extra     jsonb not null default '{}'::jsonb
);

create table if not exists public.extras (
  id        text primary key,
  trip_id   uuid not null references public.trips (id) on delete cascade,
  label     text,
  category  text,
  currency  text,
  amount    numeric,
  include   boolean not null default true
);

-- Per-city free-text notes (maps to state.notes — { city: text })
create table if not exists public.notes (
  trip_id   uuid not null references public.trips (id) on delete cascade,
  city      text not null,
  body      text,
  primary key (trip_id, city)
);

-- ---------------------------------------------------------------------------
-- LEDGER  (maps 1:1 to income.json rows — the income/expense P&L)
-- ---------------------------------------------------------------------------
create table if not exists public.ledger (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  entry_date date not null,
  type       text not null check (type in ('income','expense')),
  category   text,
  amount     numeric not null,
  currency   text not null default 'HUF',
  note       text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists ledger_trip_date_idx on public.ledger (trip_id, entry_date);

-- ---------------------------------------------------------------------------
-- CITIES (optional) — the knowledge base, if you later want it shared/editable
-- in the DB instead of cities.json. Until then, cities.json stays the source.
-- ---------------------------------------------------------------------------
create table if not exists public.cities (
  id        bigint generated always as identity primary key,
  region    text,
  country   text,
  city      text not null,
  lat       double precision,
  lng       double precision,
  data      jsonb not null default '{}'::jsonb,  -- costs, food, weather, landmarks…
  is_public boolean not null default true,        -- shared catalogue vs user-added
  owner     uuid references auth.users (id)       -- null = built-in/public
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Every row is reachable only by the trip's owner or its members.
-- ============================================================================
create or replace function public.can_access_trip(t uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.trips        where id = t and owner = auth.uid())
      or exists (select 1 from public.trip_members  where trip_id = t and user_id = auth.uid());
$$;

alter table public.trips        enable row level security;
alter table public.trip_members enable row level security;
alter table public.segments     enable row level security;
alter table public.stays        enable row level security;
alter table public.transport    enable row level security;
alter table public.extras       enable row level security;
alter table public.notes        enable row level security;
alter table public.ledger       enable row level security;
alter table public.cities       enable row level security;

-- trips: owner or member can read; owner manages membership/ownership
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips for select
  using (owner = auth.uid() or public.can_access_trip(id));
drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips for insert with check (owner = auth.uid());
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update using (owner = auth.uid());
drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips for delete using (owner = auth.uid());

drop policy if exists members_all on public.trip_members;
create policy members_all on public.trip_members for all
  using (public.can_access_trip(trip_id))
  with check (exists (select 1 from public.trips where id = trip_id and owner = auth.uid()));

-- child tables: full access if you can access the parent trip
do $$
declare tbl text;
begin
  foreach tbl in array array['segments','stays','transport','extras','notes','ledger']
  loop
    execute format('drop policy if exists %1$s_all on public.%1$s;', tbl);
    execute format(
      'create policy %1$s_all on public.%1$s for all using (public.can_access_trip(trip_id)) with check (public.can_access_trip(trip_id));',
      tbl);
  end loop;
end $$;

-- cities: public catalogue readable by all signed-in users; you manage your own
drop policy if exists cities_select on public.cities;
create policy cities_select on public.cities for select
  using (is_public or owner = auth.uid());
drop policy if exists cities_write on public.cities;
create policy cities_write on public.cities for all
  using (owner = auth.uid()) with check (owner = auth.uid());

-- ============================================================================
-- Done. Next: DATABASE.md walks through creating the project, getting your
-- keys, and (later) pointing the app at this.
-- ============================================================================
