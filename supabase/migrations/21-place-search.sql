-- ============================================================================
-- 21-place-search.sql — the other half of Tier-2 search.
--
-- Migration 20 indexed places.name with pg_trgm but shipped no RPC for it, so
-- the approved Explore mock (08, "Searching") promised a Places group the app
-- could not actually fill. This closes that gap.
--
-- Places are user-extensible (source='user', migration 09/14), so search has to
-- span BOTH the catalogue's own rows and the couple's additions — that is the
-- point of the Explore search per mock 08.
--
-- Idempotent, additive-only. Depends on 09/14 (places), 20 (pg_trgm).
-- ============================================================================

create or replace function public.search_places(p_q text default '', p_limit int default 20)
returns table (
  id uuid,
  name text,
  kind text,
  city_id bigint,
  city_name text,
  lat double precision,
  lng double precision,
  source text
)
language sql stable security invoker set search_path = public as $$
  select p.id, p.name, p.kind, p.city_id,
         -- city_id wins when the place is attached to a catalogue city;
         -- city_name carries the free-text city for non-catalogue stops.
         coalesce(c.city, p.city_name) as city_name,
         p.lat, p.lng, p.source
  from public.places p
  left join public.cities c on c.id = p.city_id
  where coalesce(trim(p_q), '') <> ''
    and (
      lower(p.name) like lower(trim(p_q)) || '%'
      or lower(p.name) % lower(trim(p_q))
      or lower(coalesce(c.city, p.city_name)) like lower(trim(p_q)) || '%'
    )
  order by
    (lower(p.name) like lower(trim(p_q)) || '%') desc,
    similarity(lower(p.name), lower(trim(p_q))) desc,
    p.name
  limit least(greatest(p_limit, 1), 100);
$$;
-- Unlike search_cities, a BLANK query returns nothing: an empty Explore box
-- should browse countries, not dump every place in the database.
--
-- security invoker — the places RLS already says "any signed-in user reads all",
-- which is exactly the intended visibility.
revoke all on function public.search_places(text, int) from public, anon;
grant execute on function public.search_places(text, int) to authenticated;
