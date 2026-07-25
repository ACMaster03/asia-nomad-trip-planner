-- ============================================================================
-- 23-geonames.sql — the world city layer (Tier 2).
--
-- ATTRIBUTION (required): city and country data from GeoNames,
-- https://www.geonames.org — licensed CC BY 4.0. The UI credits it wherever
-- world results are shown.
--
-- WHY A SEPARATE TABLE and not rows in public.cities:
--   * cities is the CURATED catalogue — 46 rows of editorial content (costs,
--     12-month weather, landmarks, visas). Mixing 34 000 imported rows into it
--     would drown that and fight its unique (country, city) constraint.
--   * fetchCityList() downloads the light cities list for Explore's browse and
--     the stop picker's offline fallback. That is ~8 kB at 46 rows and must
--     STAY that way — putting the import there would undo migration 20's whole
--     point. geo_cities is reachable ONLY through search_cities().
--   * The curated/imported distinction is meaningful to the user: a curated
--     city can estimate a budget, an imported one cannot. The picker already
--     renders an "in catalogue" badge for exactly this.
--
-- Scope is cities15000 (population > 15 000, ~34k rows, ~3 MB). This is a
-- "does the place exist and where is it" layer, not a gazetteer.
--
-- Idempotent, additive-only. Depends on 20 (pg_trgm, search_cities).
-- ============================================================================

create table if not exists public.geo_countries (
  iso2       text primary key,
  iso3       text,
  name       text not null,
  capital    text,
  continent  text,
  population bigint
);

create table if not exists public.geo_cities (
  geonameid    bigint primary key,
  name         text not null,
  ascii_name   text,
  country_code text not null references public.geo_countries (iso2),
  admin1       text,
  lat          double precision,
  lng          double precision,
  population   bigint not null default 0,
  timezone     text,
  -- PPLC = national capital, PPLA = first-order admin capital. Kept so the map
  -- layer can show capitals without another import.
  feature_code text
);

create index if not exists geo_cities_country_idx on public.geo_cities (country_code);
create index if not exists geo_cities_pop_idx on public.geo_cities (population desc);
create index if not exists geo_cities_name_trgm on public.geo_cities using gin (lower(name) gin_trgm_ops);
create index if not exists geo_cities_ascii_trgm on public.geo_cities using gin (lower(ascii_name) gin_trgm_ops);

alter table public.geo_countries enable row level security;
alter table public.geo_cities enable row level security;

-- World reference data: any signed-in user may read; writes are import-only
-- (service role / psql), so there is deliberately no write policy.
drop policy if exists geo_countries_select on public.geo_countries;
create policy geo_countries_select on public.geo_countries
  for select to authenticated using (true);
drop policy if exists geo_cities_select on public.geo_cities;
create policy geo_cities_select on public.geo_cities
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- search_cities v2 — curated catalogue FIRST, then the world.
--
-- The return type gains in_catalogue, so the drop is required (a return type
-- cannot be changed by create or replace).
--
-- Curated rows always outrank imported ones for the same query: if Bangkok is
-- in the catalogue, the catalogue's Bangkok is the one that can price a budget.
-- Within the world layer, population breaks ties — searching "san" should
-- surface San Francisco before San Ramon.
-- ---------------------------------------------------------------------------
drop function if exists public.search_cities(text, int);

create or replace function public.search_cities(p_q text default '', p_limit int default 20)
returns table (
  id bigint,
  city text,
  country text,
  region text,
  region_name text,
  lat double precision,
  lng double precision,
  daily_living_mid numeric,
  accom_mid numeric,
  in_catalogue boolean,
  population bigint
)
language sql stable security invoker set search_path = public as $$
  with q as (select lower(trim(coalesce(p_q, ''))) as t)
  -- The outer list must name the declared columns exactly: the subquery also
  -- carries tier/prefix/sim/ord for ranking, and `select *` would return them.
  select id, city, country, region, region_name, lat, lng,
         daily_living_mid, accom_mid, in_catalogue, population
  from (
    -- 1. the curated catalogue
    select c.id, c.city, c.country, c.region, c.region_name,
           c.lat, c.lng, c.daily_living_mid, c.accom_mid,
           true as in_catalogue, null::bigint as population,
           0 as tier,
           (lower(c.city) like q.t || '%') as prefix,
           similarity(lower(c.city), q.t) as sim,
           c.sort_order as ord
    from public.cities c, q
    where q.t = ''
       or lower(c.city) like q.t || '%'
       or lower(c.city) % q.t
       or lower(c.country) like q.t || '%'

    union all

    -- 2. the world layer, never for a blank query (that browses the catalogue)
    select g.geonameid, g.name, gc.name, null::text, null::text,
           g.lat, g.lng, null::numeric, null::numeric,
           false as in_catalogue, g.population,
           1 as tier,
           -- Prefix and similarity both consider the ASCII name, or an accented
           -- city never matches its plain spelling: "erd" must find "Érd",
           -- whose ascii_name is "Erd".
           (lower(g.name) like q.t || '%' or lower(g.ascii_name) like q.t || '%') as prefix,
           greatest(similarity(lower(g.name), q.t),
                    similarity(lower(coalesce(g.ascii_name, g.name)), q.t)) as sim,
           null::integer as ord
    from public.geo_cities g
    join public.geo_countries gc on gc.iso2 = g.country_code, q
    where q.t <> ''
      and not exists (
        -- suppress the world copy of a city the catalogue already curates
        select 1 from public.cities c
        where lower(c.city) = lower(g.name) and lower(c.country) = lower(gc.name)
      )
      and (lower(g.name) like q.t || '%'
           or lower(g.ascii_name) like q.t || '%'
           or lower(g.name) % q.t)
  ) hits
  -- Among PREFIX matches population decides, because "san" should surface San
  -- Juan rather than a 15k town that happens to score higher on trigram
  -- similarity (shorter names always do). Fuzzy matches fall back to similarity.
  order by tier,
           prefix desc,
           case when prefix then population end desc nulls last,
           sim desc,
           population desc nulls last,
           ord nulls last,
           city
  limit least(greatest(p_limit, 1), 100);
$$;
revoke all on function public.search_cities(text, int) from public, anon;
grant execute on function public.search_cities(text, int) to authenticated;
