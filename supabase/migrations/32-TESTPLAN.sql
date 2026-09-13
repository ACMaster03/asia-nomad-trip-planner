-- ============================================================================
-- 32-TESTPLAN.sql — assertions for the souvenirs/accessories split.
--
-- Run against STAGING after applying 32-ledger-categories-souvenirs-accessories.sql.
-- Every block raises on failure; a clean run means every assertion held. Rolls
-- itself back.
--
-- What must hold:
--   1. No alias folds to "shopping" any more; Souvenir/Accessories fold to
--      their own ids.
--   2. remap_ledger_category moves exactly the rows in the old bucket, bumps
--      ledger_rev once per touched trip, leaves other rows and trips alone,
--      and a second run is a no-op.
--   3. An end user (role authenticated) cannot call it.
-- ============================================================================

begin;

insert into auth.users (id, email, email_confirmed_at)
values ('11111111-1111-1111-1111-111111111132', 'owner@tp32.local', now())
on conflict (id) do nothing;
insert into public.profiles (id) values ('11111111-1111-1111-1111-111111111132')
on conflict (id) do nothing;

insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa32',
        '11111111-1111-1111-1111-111111111132', 'TP32 Trip',
        '{"meta":{"tripName":"TP32 Trip"}}'::jsonb,
        '[
          {"id":"a","date":"2026-09-01","type":"expense","category":"shopping","amount":1,"currency":"THB","note":"Phone strap"},
          {"id":"b","date":"2026-09-01","type":"expense","category":"clothes","amount":2,"currency":"THB","note":"Panties"},
          {"id":"c","date":"2026-09-02","type":"expense","category":"shopping","amount":3,"currency":"THB","note":"Sunglasses"}
        ]'::jsonb),
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb32',
        '11111111-1111-1111-1111-111111111132', 'TP32 Untouched',
        '{"meta":{"tripName":"TP32 Untouched"}}'::jsonb,
        '[
          {"id":"a","date":"2026-09-01","type":"expense","category":"food","amount":1,"currency":"THB","note":""}
        ]'::jsonb)
on conflict (id) do nothing;

-- ---- 1) the alias table -----------------------------------------------------
do $$
begin
  if exists (select 1 from public.ledger_category_aliases where id = 'shopping') then
    raise exception 'TP32-1a: aliases still fold to shopping';
  end if;
  if (select id from public.ledger_category_aliases where alias = public.fold_category('Souvenir')) is distinct from 'souvenirs' then
    raise exception 'TP32-1b: "Souvenir" does not fold to souvenirs';
  end if;
  if (select id from public.ledger_category_aliases where alias = public.fold_category('Accessories')) is distinct from 'accessories' then
    raise exception 'TP32-1c: "Accessories" does not fold to accessories';
  end if;
  if (select id from public.ledger_category_aliases where alias = 'gifts') is distinct from 'souvenirs' then
    raise exception 'TP32-1d: "gifts" should fold to souvenirs';
  end if;
end $$;

-- ---- 2) the remap -----------------------------------------------------------
do $$
declare
  v_n     integer;
  v_rev_a integer;
  v_rev_b integer;
  v_cats  text;
begin
  select ledger_rev into v_rev_a from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa32';
  select ledger_rev into v_rev_b from public.trips where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb32';

  v_n := public.remap_ledger_category('shopping', 'accessories');
  if v_n < 2 then
    raise exception 'TP32-2a: expected at least the 2 fixture rows moved, got %', v_n;
  end if;

  select string_agg(e ->> 'id' || '=' || (e ->> 'category'), ',' order by e ->> 'id')
    into v_cats
    from public.trips t cross join lateral jsonb_array_elements(t.ledger) e
   where t.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa32';
  if v_cats <> 'a=accessories,b=clothes,c=accessories' then
    raise exception 'TP32-2b: unexpected categories after remap: %', v_cats;
  end if;

  -- notes and order untouched
  if (select ledger -> 0 ->> 'note' from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa32') <> 'Phone strap' then
    raise exception 'TP32-2c: note was altered';
  end if;

  if (select ledger_rev from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa32') <> v_rev_a + 1 then
    raise exception 'TP32-2d: ledger_rev not bumped exactly once';
  end if;
  if (select ledger_rev from public.trips where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb32') <> v_rev_b then
    raise exception 'TP32-2e: a trip without shopping rows was touched';
  end if;

  v_n := public.remap_ledger_category('shopping', 'accessories');
  if v_n <> 0 then
    raise exception 'TP32-2f: second run should be a no-op, changed %', v_n;
  end if;
  if (select ledger_rev from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa32') <> v_rev_a + 1 then
    raise exception 'TP32-2g: second run bumped ledger_rev';
  end if;
end $$;

-- ---- 3) not callable by end users ---------------------------------------------
do $$
begin
  set local role authenticated;
  begin
    perform public.remap_ledger_category('shopping', 'accessories');
    raise exception 'TP32-3: authenticated could call remap_ledger_category';
  exception
    when insufficient_privilege then null;
  end;
  reset role;
end $$;

rollback;
