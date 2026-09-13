-- ============================================================================
-- 32 — "Shopping" was too general (owner, 2026-09-13). It goes; Souvenirs and
-- Accessories come back as their own categories, the way the ledger had them
-- before migration 31 folded them together.
--
-- Mirrors lib/trips/categories.ts exactly (categories.test.ts asserts the two
-- alias tables agree after 31 + 32 are applied in order). Rows that migration
-- 31 filed under "shopping" move to "accessories"; nothing else is touched.
-- ============================================================================

-- 1) Alias table: drop the merged bucket, add the two real ones.
delete from public.ledger_category_aliases where id = 'shopping';

insert into public.ledger_category_aliases (alias, id, canonical) values
  -- accessories
  ('accessories', 'accessories', true), ('accessory', 'accessories', false), ('jewellery', 'accessories', false),
  ('jewelry', 'accessories', false), ('sunglasses', 'accessories', false), ('hair pins', 'accessories', false),
  ('phone strap', 'accessories', false),
  -- souvenirs
  ('souvenirs', 'souvenirs', true), ('souvenir', 'souvenirs', false), ('gift', 'souvenirs', false),
  ('gifts', 'souvenirs', false), ('keepsake', 'souvenirs', false), ('postcard', 'souvenirs', false),
  ('postcards', 'souvenirs', false)
on conflict (alias) do update set id = excluded.id, canonical = excluded.canonical;

-- 2) Move every ledger row from one category id to another, trip by trip.
--    Returns the number of rows changed; a trip with none is left untouched
--    (no ledger_rev bump), so re-runs are free. Operator/backend only, like
--    normalize_ledger_categories.
create or replace function public.remap_ledger_category(from_id text, to_id text)
returns integer
language plpgsql volatile
set search_path = public
as $$
declare
  r       record;
  v_n     integer;
  v_total integer := 0;
begin
  for r in
    select t.id
      from public.trips t
     where t.ledger @> jsonb_build_array(jsonb_build_object('category', from_id))
  loop
    update public.trips t
       set ledger = (
             select jsonb_agg(
                      case when x.e ->> 'category' = from_id
                           then x.e || jsonb_build_object('category', to_id)
                           else x.e end
                      order by x.ord)
               from jsonb_array_elements(t.ledger) with ordinality as x(e, ord)),
           ledger_rev = ledger_rev + 1,
           updated_at = now()
     where t.id = r.id;
    select count(*) into v_n
      from public.trips t
      cross join lateral jsonb_array_elements(t.ledger) e
     where t.id = r.id and e ->> 'category' = to_id;
    v_total := v_total + v_n;
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.remap_ledger_category(text, text) from public, anon, authenticated;
grant  execute on function public.remap_ledger_category(text, text) to service_role;

-- 3) Apply: the rows 31 filed under "shopping" become accessories.
do $$
declare
  v_n integer;
begin
  v_n := public.remap_ledger_category('shopping', 'accessories');
  raise notice 'migration 32: % ledger entries moved from shopping to accessories', v_n;
end;
$$;
