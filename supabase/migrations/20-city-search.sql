-- ============================================================================
-- 20-city-search.sql — M4: make the catalogue searchable on the SERVER, so the
-- world dataset can grow without the client downloading it.
--
-- THE PROBLEM THIS SOLVES (audit 2026-07-25): fetchCities() selected every
-- column INCLUDING the attributes jsonb, with no limit, and every search was a
-- client-side filter over that array. At 46 cities that is ~100 kB and fine.
-- The same shape at 10 000 cities is ~20 MB per client, and there was no text
-- index anywhere to do better — the download-everything pattern existed
-- BECAUSE search was client-side. This breaks that coupling.
--
-- THE TIER RULE the owner and I agreed:
--   Tier 1 — the trip's own cities and places: small, offline, precached. The
--            budget genuinely needs their attributes (costs.accomPerNight and
--            costs.dailyLiving feed buildCityIndex), so those stay whole.
--   Tier 2 — the world: never bulk-downloaded, searched here, online only.
--            Fine to gate behind an online/paid feature later.
--
-- Idempotent, additive-only. Depends on 03/04 (catalogue), 09/14 (places).
-- ============================================================================

create extension if not exists pg_trgm;

-- Trigram indexes: substring and fuzzy matching, which btree cannot do.
-- lower() to match the case-insensitive lookups the app already performs.
create index if not exists cities_city_trgm on public.cities using gin (lower(city) gin_trgm_ops);
create index if not exists cities_country_trgm on public.cities using gin (lower(country) gin_trgm_ops);
create index if not exists places_name_trgm on public.places using gin (lower(name) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- search_cities(q, limit) — the Tier-2 read.
--
-- Returns ONLY the light columns. attributes is deliberately excluded: it is
-- the bulk of the row, and a search result list never renders it. Callers that
-- need the full record fetch one city by id (fetchCityDetail).
--
-- Ranking: exact prefix on the city name first, then similarity, then the
-- catalogue's own sort_order — so typing "ban" surfaces Bangkok before
-- Bandung, and a blank query still returns a sensible browse list.
-- ---------------------------------------------------------------------------
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
  accom_mid numeric
)
language sql stable security invoker set search_path = public as $$
  select c.id, c.city, c.country, c.region, c.region_name,
         c.lat, c.lng, c.daily_living_mid, c.accom_mid
  from public.cities c
  where coalesce(trim(p_q), '') = ''
     or lower(c.city) like lower(trim(p_q)) || '%'
     or lower(c.city) % lower(trim(p_q))
     or lower(c.country) like lower(trim(p_q)) || '%'
  order by
    -- exact prefix beats fuzzy, so "ban" -> Bangkok before Bandung
    (lower(c.city) like lower(trim(p_q)) || '%') desc,
    similarity(lower(c.city), lower(coalesce(trim(p_q), ''))) desc,
    c.sort_order nulls last,
    c.city
  limit least(greatest(p_limit, 1), 100);
$$;
-- security invoker on purpose: the cities RLS ("to authenticated") is exactly
-- the policy we want, so this needs no definer privileges to bypass anything.
revoke all on function public.search_cities(text, int) from public, anon;
grant execute on function public.search_cities(text, int) to authenticated;
