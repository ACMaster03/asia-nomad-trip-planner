-- ============================================================================
-- 31-TESTPLAN.sql — assertions for the ledger-category fold.
--
-- Run against STAGING after applying 31-ledger-categories.sql. Every block
-- raises on failure; a clean run means every assertion held. Rolls itself back.
--
-- What must hold:
--   1. Known spellings fold to their registry id; unknown text is left alone.
--   2. A row that loses its wording keeps it as the note — but not when the
--      wording was only the registry label/id in different casing.
--   3. The function reports how many rows it changed, bumps ledger_rev once,
--      and a second run is a no-op (no bump).
--   4. An end user (role authenticated) cannot call it.
-- ============================================================================

begin;

insert into auth.users (id, email, email_confirmed_at)
values ('11111111-1111-1111-1111-111111111131', 'owner@tp31.local', now())
on conflict (id) do nothing;
insert into public.profiles (id) values ('11111111-1111-1111-1111-111111111131')
on conflict (id) do nothing;

insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa31',
        '11111111-1111-1111-1111-111111111131', 'TP31 Trip',
        '{"meta":{"tripName":"TP31 Trip"}}'::jsonb,
        '[
          {"id":"a","date":"2026-09-01","type":"expense","category":"Food","amount":1,"currency":"THB","note":""},
          {"id":"b","date":"2026-09-01","type":"expense","category":" 7  eleven ","amount":2,"currency":"THB","note":""},
          {"id":"c","date":"2026-09-02","type":"expense","category":"Drinks","amount":3,"currency":"THB","note":"beer"},
          {"id":"d","date":"2026-09-02","type":"expense","category":"Shanghai airport","amount":4,"currency":"THB","note":""},
          {"id":"e","date":"2026-09-03","type":"expense","category":"Public transport","amount":5,"currency":"THB","note":""},
          {"id":"f","date":"2026-09-03","type":"expense","category":"Getting Around","amount":6,"currency":"THB","note":""},
          {"id":"g","date":"2026-09-04","type":"income","category":"Total wealth","amount":7,"currency":"HUF","note":""}
        ]'::jsonb)
on conflict (id) do nothing;

-- ---- 1–3) the fold -----------------------------------------------------------
do $$
declare
  v_rev0 integer;
  v_rev1 integer;
  v_n    integer;
  v_cat  text;
  v_note text;
  v_id   text;
begin
  select ledger_rev into v_rev0 from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa31';

  v_n := public.normalize_ledger_categories('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa31');
  if v_n <> 6 then
    raise exception 'TP31-3 FAIL: expected 6 changed rows, got %', v_n;
  end if;

  for v_id, v_cat, v_note in
    select e ->> 'id', e ->> 'category', e ->> 'note'
      from public.trips t, jsonb_array_elements(t.ledger) e
     where t.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa31'
  loop
    case v_id
      when 'a' then if v_cat <> 'food' or v_note <> '' then
        raise exception 'TP31-1 FAIL: Food → % / note "%"', v_cat, v_note; end if;
      when 'b' then if v_cat <> 'convenience' or v_note <> '7  eleven' then
        raise exception 'TP31-2 FAIL: 7 eleven → % / note "%"', v_cat, v_note; end if;
      when 'c' then if v_cat <> 'drinks' or v_note <> 'beer' then
        raise exception 'TP31-2 FAIL: Drinks → % / note "%" (existing note must win)', v_cat, v_note; end if;
      when 'd' then if v_cat <> 'Shanghai airport' or v_note <> '' then
        raise exception 'TP31-1 FAIL: unknown text was rewritten to % / "%"', v_cat, v_note; end if;
      when 'e' then if v_cat <> 'local-transport' or v_note <> 'Public transport' then
        raise exception 'TP31-2 FAIL: Public transport → % / note "%"', v_cat, v_note; end if;
      when 'f' then if v_cat <> 'local-transport' or v_note <> '' then
        raise exception 'TP31-2 FAIL: the label itself must not become a note: % / "%"', v_cat, v_note; end if;
      when 'g' then if v_cat <> 'savings' or v_note <> 'Total wealth' then
        raise exception 'TP31-1 FAIL: Total wealth → % / note "%"', v_cat, v_note; end if;
      else raise exception 'TP31 FAIL: unexpected row %', v_id;
    end case;
  end loop;

  select ledger_rev into v_rev1 from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa31';
  if v_rev1 <> v_rev0 + 1 then
    raise exception 'TP31-3 FAIL: ledger_rev went % → %, expected one bump', v_rev0, v_rev1;
  end if;

  v_n := public.normalize_ledger_categories('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa31');
  select ledger_rev into v_rev0 from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa31';
  if v_n <> 0 or v_rev0 <> v_rev1 then
    raise exception 'TP31-3 FAIL: second run changed % rows / rev % → %', v_n, v_rev1, v_rev0;
  end if;
  raise notice 'TP31-1..3 ok';
end;
$$;

-- ---- 4) not callable by end users ------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111131","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.normalize_ledger_categories('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa31');
    raise exception 'TP31-4 FAIL: authenticated may call normalize_ledger_categories';
  exception
    when insufficient_privilege then null;
  end;
  perform set_config('role', 'none', true);
  raise notice 'TP31-4 ok';
end;
$$;

rollback;
