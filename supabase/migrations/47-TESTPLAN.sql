-- ============================================================================
-- 47-TESTPLAN.sql — the people who travel on a journey, by first name.
-- Run against STAGING after 47. Rolls itself back.
--
-- In the Supabase SQL editor a pass is "Success" with no error; any failure
-- stops with an error that starts "TP47 FAIL".
-- ============================================================================

begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111147', 'owner@tp47.local',    now(), '{"first_name":"Patrik"}'),
  ('22222222-2222-2222-2222-222222222247', 'editor@tp47.local',   now(), '{"first_name":"Petra"}'),
  ('33333333-3333-3333-3333-333333333347', 'viewer@tp47.local',   now(), '{"first_name":"Anna"}'),
  ('44444444-4444-4444-4444-444444444447', 'stranger@tp47.local', now(), '{"first_name":"Zed"}'),
  ('55555555-5555-5555-5555-555555555547', 'nameless@tp47.local', now(), '{}')
on conflict (id) do nothing;

insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa47', '11111111-1111-1111-1111-111111111147', 'TP47 Trip',
        '{"meta":{"tripName":"TP47 Trip","startDate":"2026-09-01"},"segments":[]}'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;

insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa47', '22222222-2222-2222-2222-222222222247', 'editor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa47', '55555555-5555-5555-5555-555555555547', 'editor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa47', '33333333-3333-3333-3333-333333333347', 'viewer')
on conflict do nothing;

-- Same role discipline as 25–34: the migration session bypasses RLS, so every
-- deny assertion needs a real SET ROLE.
create or replace function pg_temp.be(p_uid uuid, p_email text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'email', p_email, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create or replace function pg_temp.anon() returns void
language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  select set_config('role', 'anon', true);
$$;
create or replace function pg_temp.god() returns void
language sql as $$ select set_config('role', 'none', true); $$;

do $$
declare
  v jsonb;
  v_names text[];
begin
  -- 1) The owner sees the owner and the editors, owner first, then by name;
  --    the viewer is not among them; a traveller with no first name reads "A traveller".
  perform pg_temp.be('11111111-1111-1111-1111-111111111147', 'owner@tp47.local');
  v := public.trip_travellers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa47');
  perform pg_temp.god();
  if v is null or jsonb_typeof(v) <> 'array' then
    raise exception 'TP47 FAIL: the owner got no list: %', v;
  end if;
  select array_agg(e->>'name' order by ord) into v_names
    from jsonb_array_elements(v) with ordinality as t(e, ord);
  if v_names <> array['Patrik', 'A traveller', 'Petra'] then
    raise exception 'TP47 FAIL: expected Patrik, A traveller, Petra; got %', v_names;
  end if;
  if (v->0->>'isOwner')::boolean is not true or (v->1->>'isOwner')::boolean is not false then
    raise exception 'TP47 FAIL: isOwner is wrong: %', v;
  end if;
  if v::text ~* 'anna|zed|@tp47' then
    raise exception 'TP47 FAIL: a viewer, a stranger or an email reached the list: %', v;
  end if;

  -- 2) An editor and a viewer get the same list.
  perform pg_temp.be('22222222-2222-2222-2222-222222222247', 'editor@tp47.local');
  if public.trip_travellers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa47') <> v then
    raise exception 'TP47 FAIL: the editor sees a different list';
  end if;
  perform pg_temp.be('33333333-3333-3333-3333-333333333347', 'viewer@tp47.local');
  if public.trip_travellers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa47') <> v then
    raise exception 'TP47 FAIL: the viewer sees a different list';
  end if;

  -- 3) A stranger and an anonymous caller get nothing.
  perform pg_temp.be('44444444-4444-4444-4444-444444444447', 'stranger@tp47.local');
  if public.trip_travellers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa47') is not null then
    raise exception 'TP47 FAIL: a stranger got the list';
  end if;
  perform pg_temp.god();
  if has_function_privilege('anon', 'public.trip_travellers(uuid)', 'EXECUTE') then
    raise exception 'TP47 FAIL: anon can call trip_travellers';
  end if;

  -- 4) The helpers stay out of end users' reach (33).
  if has_function_privilege('authenticated', 'public._traveller_name(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._trip_travellers(uuid)', 'EXECUTE') then
    raise exception 'TP47 FAIL: an end-user role can call an internal helper';
  end if;

  -- 5) A journey that does not exist is nothing, not an error.
  perform pg_temp.be('11111111-1111-1111-1111-111111111147', 'owner@tp47.local');
  if public.trip_travellers('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb47') is not null then
    raise exception 'TP47 FAIL: a missing journey returned a list';
  end if;
  perform pg_temp.god();
end $$;

rollback;
