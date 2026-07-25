-- ============================================================================
-- 22-country-attributes.sql — country facts become as extensible as city facts.
--
-- THE ASYMMETRY THIS FIXES (audit 2026-07-25). catalogue_fields is data-driven
-- with a `source` telling FieldRenderer where to read a value:
--
--   'attribute' -> cities.attributes jsonb, via DOTTED PATHS ("costs.dailyLiving")
--                  => unlimited new city facts, ZERO migrations
--   'column'    -> a column on cities        => a migration per field
--   'country'   -> a COLUMN on countries     => a migration per field
--
-- So every new country fact (plug type, tipping, tap water, SIM, emergency
-- numbers) needed a schema change, while the equivalent city fact needed none.
-- Meanwhile countries.extras jsonb already existed and NOTHING read it.
--
-- This adds the missing fourth source, 'country_attribute', reading
-- countries.extras by the same dotted paths. After this, a new country fact is
-- one catalogue_fields row plus a value — no migration, no deploy.
--
-- Idempotent, additive-only. Depends on 03/04 (catalogue_fields, countries).
-- ============================================================================

alter table public.catalogue_fields drop constraint if exists catalogue_fields_source_check;
alter table public.catalogue_fields add constraint catalogue_fields_source_check
  check (source = any (array['attribute', 'column', 'country', 'country_attribute']));

-- ---------------------------------------------------------------------------
-- A starter set of traveller-facing country facts. DEFINITIONS ONLY — the
-- values are editorial and belong to the owner, not to a migration. Fields with
-- no value render nothing at all (FieldRenderer returns null on null/empty), so
-- these are invisible until they are filled in.
--
-- sort_order continues the existing Country block (visa 70, safety 72,
-- currency 73), keeping the group contiguous for CityCard's arrival-order
-- grouping.
-- ---------------------------------------------------------------------------
insert into public.catalogue_fields (key, label, field_group, type, source, unit, sort_order, show_in_list)
values
  ('plugs',     'Power sockets',     'Country', 'text', 'country_attribute', null, 74, false),
  ('tipping',   'Tipping',           'Country', 'text', 'country_attribute', null, 75, false),
  ('tap_water', 'Tap water',         'Country', 'text', 'country_attribute', null, 76, false),
  ('sim',       'SIM / eSIM',        'Country', 'text', 'country_attribute', null, 77, false),
  ('emergency', 'Emergency numbers', 'Country', 'text', 'country_attribute', null, 78, false)
on conflict (key) do nothing;

-- Guarantee extras is a usable object rather than null, so a first write is a
-- plain jsonb_set instead of a null check at every call site.
update public.countries set extras = '{}'::jsonb where extras is null;
alter table public.countries alter column extras set default '{}'::jsonb;
