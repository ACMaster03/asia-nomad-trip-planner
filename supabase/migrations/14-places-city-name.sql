-- ============================================================================
-- 14-places-city-name.sql — user places in NON-catalogue cities (dogfood
-- 2026-07-24: places added in Érd saved with city_id NULL but the picker only
-- queries by city_id, so they vanished on the next check-in).
--
-- city_name scopes user places by the segment's city string when the city has
-- no catalogue row. Catalogue places keep city_id and leave city_name null.
-- Idempotent, additive-only.
-- ============================================================================

alter table public.places add column if not exists city_name text;

create index if not exists places_city_name_idx
  on public.places (lower(city_name)) where city_id is null;
