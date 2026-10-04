-- ============================================================================
-- 45-TESTPLAN.sql — followers get each leg's from, to, date and mode, and
-- nothing else of it. Run against STAGING after 45. Rolls itself back.
--
-- In the Supabase SQL editor a pass is "Success" with no error; any failure
-- stops with an error that starts "TP45 FAIL".
-- ============================================================================

begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111145', 'owner@tp45.local', now(), '{"first_name":"Patrik"}')
on conflict (id) do nothing;

-- Four legs: a typed "Plane" with every private field filled, a train, a mode
-- typed by hand, and one left out of the plan.
insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa45',
        '11111111-1111-1111-1111-111111111145', 'TP45 Trip',
        '{"meta":{"tripName":"TP45 Trip","startDate":"2026-09-01","endDate":"2026-12-01"},
          "segments":[
            {"city":"Bangkok","country":"Thailand","arrive":"2026-09-01","depart":"2026-10-01"},
            {"city":"Hanoi","country":"Vietnam","arrive":"2026-10-01","depart":"2026-11-13"},
            {"city":"Da Nang","country":"Vietnam","arrive":"2026-11-13","depart":"2026-12-01"}],
          "transport":[
            {"id":"l1","type":"Plane","from":"Bangkok","to":"Hanoi","date":"2026-10-01",
             "provider":"SecretAir","url":"https://example.com/booking/XYZ","cur":"EUR","price":123,
             "status":"booked","notes":"seat 12A, ref XYZ","time":"07:45","via":"Vientiane","hours":5,
             "chargeDate":"2026-08-01"},
            {"id":"l2","type":" train ","from":"Hanoi","to":"Da Nang","date":"2026-11-13","cur":"EUR","price":40},
            {"id":"l3","type":"Tuk-tuk to the border","from":"Da Nang","to":"Hoi An","date":"2026-11-20","cur":"EUR","price":5},
            {"id":"l4","type":"Bus","from":"Da Nang","to":"Hue","date":"2026-11-25","cur":"EUR","price":9,"include":false}]}'::jsonb,
        '[]'::jsonb)
on conflict (id) do nothing;

do $$
declare
  v_legs jsonb;
  v_leg  jsonb;
  v_keys text[];
begin
  v_legs := public._trip_summary_core('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa45')->'legs';
  if v_legs is null then
    raise exception 'TP45 FAIL: the summary has no legs — was 45 applied?';
  end if;

  -- 1) The leg left out of the plan is not there; the other three are, in date order.
  if jsonb_array_length(v_legs) <> 3 then
    raise exception 'TP45 FAIL: expected 3 legs (one is left out of the plan), got %', jsonb_array_length(v_legs);
  end if;
  if v_legs->0->>'date' <> '2026-10-01' or v_legs->2->>'date' <> '2026-11-20' then
    raise exception 'TP45 FAIL: legs are not in date order: %', v_legs;
  end if;

  -- 2) Each leg carries exactly from, to, date and mode.
  for v_leg in select * from jsonb_array_elements(v_legs) loop
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_leg) k;
    if v_keys <> array['date','from','mode','to'] then
      raise exception 'TP45 FAIL: a leg carries more or less than from/to/date/mode: %', v_leg;
    end if;
  end loop;

  -- 3) Nothing private anywhere in the summary.
  if public._trip_summary_core('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa45')::text ~* '(SecretAir|XYZ|12A|Vientiane|07:45|123)' then
    raise exception 'TP45 FAIL: a private leg field reached the summary';
  end if;

  -- 4) The mode is a fixed word: "Plane" → flight, " train " → train, typed text → other.
  if v_legs->0->>'mode' <> 'flight' or v_legs->1->>'mode' <> 'train' or v_legs->2->>'mode' <> 'other' then
    raise exception 'TP45 FAIL: modes are %, %, % (want flight, train, other)',
      v_legs->0->>'mode', v_legs->1->>'mode', v_legs->2->>'mode';
  end if;

  -- 5) The core stays out of end users' reach, as in 33.
  if has_function_privilege('authenticated', 'public._trip_summary_core(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public._trip_summary_core(uuid)', 'EXECUTE') then
    raise exception 'TP45 FAIL: an end-user role can call _trip_summary_core directly';
  end if;

  -- 6) The rest of the summary is untouched.
  if (public._trip_summary_core('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa45')->'travellers') is null then
    raise exception 'TP45 FAIL: travellers went missing';
  end if;
end $$;

update public.trips set state = state - 'transport' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa45';
do $$
begin
  if public._trip_summary_core('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa45')->'legs' <> '[]'::jsonb then
    raise exception 'TP45 FAIL: a journey without transport should get legs = []';
  end if;
end $$;

rollback;
