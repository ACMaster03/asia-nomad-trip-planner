-- ============================================================================
-- 46-TESTPLAN.sql — followers get only the legs between two stops of the plan.
-- Run against STAGING after 46. Rolls itself back.
--
-- In the Supabase SQL editor a pass is "Success" with no error; any failure
-- stops with an error that starts "TP46 FAIL".
-- ============================================================================

begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111146', 'owner@tp46.local', now(), '{"first_name":"Patrik"}')
on conflict (id) do nothing;

-- Stops: Bangkok, Hanoi, Da Nang, "Hong Kong Island", and Hue left out of the plan.
-- Legs: from home, two between stops, one to Hong Kong spelt shorter, one to a
-- place that is no stop, one to the stop left out, and the way home.
insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa46',
        '11111111-1111-1111-1111-111111111146', 'TP46 Trip',
        '{"meta":{"tripName":"TP46 Trip","startDate":"2026-08-31","endDate":"2027-01-10","homeBase":"Budapest, Hungary"},
          "segments":[
            {"city":"Bangkok","country":"Thailand","arrive":"2026-09-01","depart":"2026-10-01"},
            {"city":"Hanoi","country":"Vietnam","arrive":"2026-10-01","depart":"2026-11-13"},
            {"city":"Da Nang","country":"Vietnam","arrive":"2026-11-13","depart":"2026-12-13"},
            {"city":"Hue","country":"Vietnam","arrive":"2026-12-13","depart":"2026-12-15","include":false},
            {"city":"Hong Kong Island","country":"Hong Kong","arrive":"2026-12-15","depart":"2027-01-10"}],
          "transport":[
            {"id":"h1","type":"Flight","from":"Budapest","to":"Bangkok","date":"2026-08-31"},
            {"id":"s1","type":"Flight","from":"Bangkok","to":"Hanoi","date":"2026-10-01"},
            {"id":"s2","type":"Train","from":"Hanoi (Old Quarter)","to":"da nang","date":"2026-11-13"},
            {"id":"x1","type":"Bus","from":"Da Nang","to":"Hoi An","date":"2026-11-20"},
            {"id":"x2","type":"Bus","from":"Da Nang","to":"Hue","date":"2026-12-13"},
            {"id":"s3","type":"Flight","from":"Da Nang","to":"Hong Kong","date":"2026-12-15"},
            {"id":"h2","type":"Flight","from":"Hong Kong Island","to":"Budapest","date":"2027-01-10"}]}'::jsonb,
        '[]'::jsonb)
on conflict (id) do nothing;

do $$
declare
  v_sum  jsonb := public._trip_summary_core('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa46');
  v_legs jsonb := v_sum->'legs';
  v_leg  jsonb;
  v_keys text[];
begin
  if v_legs is null then
    raise exception 'TP46 FAIL: the summary has no legs';
  end if;

  -- 1) Only the three legs between stops, in date order.
  if jsonb_array_length(v_legs) <> 3 then
    raise exception 'TP46 FAIL: expected 3 legs between stops, got %: %', jsonb_array_length(v_legs), v_legs;
  end if;
  if v_legs->0->>'from' <> 'Bangkok' or v_legs->1->>'to' <> 'da nang' or v_legs->2->>'to' <> 'Hong Kong' then
    raise exception 'TP46 FAIL: the wrong legs crossed: %', v_legs;
  end if;

  -- 2) Home appears nowhere in the follower projection.
  if v_sum::text ~* 'budapest|hungary' then
    raise exception 'TP46 FAIL: the home city reached the summary: %', v_sum;
  end if;

  -- 3) Neither the place that is no stop nor the stop left out of the plan.
  if v_legs::text ~* 'hoi an|hue' then
    raise exception 'TP46 FAIL: a leg to a place that is not a stop crossed: %', v_legs;
  end if;

  -- 4) Still exactly from, to, date and mode (45).
  for v_leg in select * from jsonb_array_elements(v_legs) loop
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_leg) k;
    if v_keys <> array['date','from','mode','to'] then
      raise exception 'TP46 FAIL: a leg carries more or less than from/to/date/mode: %', v_leg;
    end if;
  end loop;
  if v_legs->1->>'mode' <> 'train' then
    raise exception 'TP46 FAIL: modes changed: %', v_legs;
  end if;

  -- 5) The helpers stay out of end users' reach.
  if has_function_privilege('authenticated', 'public._same_city(text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public._same_city(text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._trip_summary_core(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public._trip_summary_core(uuid)', 'EXECUTE') then
    raise exception 'TP46 FAIL: an end-user role can call an internal helper';
  end if;

  -- 6) The name match: one name the other plus words, at a word boundary.
  if not public._same_city('Hong Kong', 'Hong Kong Island') or public._same_city('York', 'New York')
     or not public._same_city('Hanoi (Old Quarter)', 'hanoi') or public._same_city('', '') then
    raise exception 'TP46 FAIL: _same_city does not match norm.ts sameCity';
  end if;

  -- 7) The rest of the summary is untouched.
  if jsonb_array_length(v_sum->'route') <> 4 or (v_sum->'travellers') is null then
    raise exception 'TP46 FAIL: route or travellers changed: %', v_sum;
  end if;
end $$;

rollback;
