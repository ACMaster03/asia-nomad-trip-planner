-- ============================================================================
-- 24-osm-places.sql — the world attraction layer (Tier 2).
--
-- ATTRIBUTION (required): (c) OpenStreetMap contributors, licensed ODbL 1.0.
-- Note the SHARE-ALIKE clause: a derived database that gets published inherits
-- it. That matters for the P3 community phase and P4 monetisation, and is a
-- stronger obligation than GeoNames' CC BY in migration 23.
--
-- SCOPE, decided with measured Overpass counts 2026-07-25: attractions only.
-- Thailand alone has 19 456 amenity=restaurant nodes against 2 781
-- tourism=attraction. A restaurant reduced to a name and a coordinate — no
-- hours, photos or reviews — is weaker than a map app for the same job, and the
-- P3 differentiator is user-contributed reviews, which importing 300 000
-- unreviewed names does not advance.
--
-- WHY A SEPARATE TABLE from public.places, exactly as geo_cities is separate
-- from public.cities:
--   * places is the CHECK-IN target: user-created rows (source='user'), a
--     created_by owner, check_ins referencing it, and unique (city_id, name).
--     Importing tens of thousands of rows would fight that constraint and
--     require a spatial city_id mapping we have no PostGIS for.
--   * geo_places carries coordinates instead, so it is matched by PROXIMITY to
--     a city rather than by a foreign key.
--   * The curated/imported split stays meaningful to the user and to search.
--
-- Idempotent, additive-only. Depends on 20 (pg_trgm), 21 (search_places).
-- ============================================================================

create table if not exists public.geo_places (
  osm_type     text   not null check (osm_type in ('node', 'way', 'relation')),
  osm_id       bigint not null,
  name         text   not null,
  -- the OSM tourism=* value: attraction, museum, viewpoint, artwork, zoo,
  -- theme_park, gallery
  kind         text,
  country_code text,
  lat          double precision not null,
  lng          double precision not null,
  primary key (osm_type, osm_id)
);

create index if not exists geo_places_name_trgm on public.geo_places using gin (lower(name) gin_trgm_ops);
create index if not exists geo_places_country_idx on public.geo_places (country_code);
-- Bounding-box prefilter for "attractions near this city". A btree on (lat,lng)
-- is enough at this size; PostGIS would be the answer if this ever grows.
create index if not exists geo_places_latlng_idx on public.geo_places (lat, lng);

alter table public.geo_places enable row level security;
drop policy if exists geo_places_select on public.geo_places;
create policy geo_places_select on public.geo_places
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- search_places v2 — the couple's own places FIRST, then the world.
--
-- Return type gains in_catalogue, so the drop is required.
--
-- A curated or user-created place outranks an imported one for the same query:
-- if they have already added "Jay Fai", theirs is the row they mean. Imported
-- rows carry an OSM id, which is a DIFFERENT ID SPACE from places.id (uuid) —
-- hence the text id and the in_catalogue flag, so callers cannot confuse them.
-- ---------------------------------------------------------------------------
drop function if exists public.search_places(text, int);

create or replace function public.search_places(p_q text default '', p_limit int default 20)
returns table (
  id text,
  name text,
  kind text,
  city_name text,
  lat double precision,
  lng double precision,
  in_catalogue boolean
)
language sql stable security invoker set search_path = public as $$
  with q as (select lower(trim(coalesce(p_q, ''))) as t)
  select id, name, kind, city_name, lat, lng, in_catalogue
  from (
    select p.id::text as id, p.name, p.kind,
           coalesce(c.city, p.city_name) as city_name,
           p.lat, p.lng, true as in_catalogue,
           0 as tier,
           (lower(p.name) like q.t || '%') as prefix,
           similarity(lower(p.name), q.t) as sim
    from public.places p
    left join public.cities c on c.id = p.city_id, q
    where q.t <> ''
      and (lower(p.name) like q.t || '%'
           or lower(p.name) % q.t
           or lower(coalesce(c.city, p.city_name)) like q.t || '%')

    union all

    select g.osm_type || '/' || g.osm_id, g.name, g.kind,
           null::text, g.lat, g.lng, false,
           1 as tier,
           (lower(g.name) like q.t || '%') as prefix,
           similarity(lower(g.name), q.t) as sim
    from public.geo_places g, q
    where q.t <> ''
      and (lower(g.name) like q.t || '%' or lower(g.name) % q.t)
      and not exists (
        -- suppress the OSM copy of a place they already have
        select 1 from public.places p where lower(p.name) = lower(g.name)
      )
  ) hits
  order by tier, prefix desc, sim desc, name
  limit least(greatest(p_limit, 1), 100);
$$;
revoke all on function public.search_places(text, int) from public, anon;
grant execute on function public.search_places(text, int) to authenticated;
