-- ============================================================================
-- 43-TESTPLAN.sql — home on the person: the column is there, the backfill
-- fills only what is empty and only from journeys a person owns, and a person
-- sets their own home and nobody else's, not even a travel partner's whose
-- profile they can read. Run against STAGING after 43. Rolls itself back.
--
-- In the Supabase SQL editor a pass is "Success" with no error; any failure
-- stops with an error that starts "TP43 FAIL".
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) The column: text, nullable, no default. Null means "not set", and the
--    journey's home is used meanwhile; a default would put everyone in one city.
-- ---------------------------------------------------------------------------
do $$
declare
  v_type text; v_nullable text; v_default text;
begin
  select data_type, is_nullable, column_default into v_type, v_nullable, v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'home_base';
  if v_type is null then
    raise exception 'TP43 FAIL: profiles.home_base does not exist — was 43 applied?';
  end if;
  if v_type <> 'text' then
    raise exception 'TP43 FAIL: home_base is %, not text', v_type;
  end if;
  if v_nullable <> 'YES' then
    raise exception 'TP43 FAIL: home_base is NOT NULL, so "not set" cannot be stored';
  end if;
  if v_default is not null then
    raise exception 'TP43 FAIL: home_base defaults to %', v_default;
  end if;
  raise notice 'TP43 OK (1/3): a nullable text column with no default';
end $$;

-- A owns a journey from Lisbon; B travels with A and owns nothing; C already
-- set a home and owns a journey from somewhere else; D owns a journey with a
-- blank home.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111143', 'a@tp43.local', now(), '{"first_name":"A"}'),
  ('22222222-2222-2222-2222-222222222243', 'b@tp43.local', now(), '{"first_name":"B"}'),
  ('33333333-3333-3333-3333-333333333343', 'c@tp43.local', now(), '{"first_name":"C"}'),
  ('44444444-4444-4444-4444-444444444443', 'd@tp43.local', now(), '{"first_name":"D"}')
on conflict (id) do nothing;
insert into public.profiles (id) values
  ('11111111-1111-1111-1111-111111111143'),
  ('22222222-2222-2222-2222-222222222243'),
  ('33333333-3333-3333-3333-333333333343'),
  ('44444444-4444-4444-4444-444444444443')
on conflict (id) do nothing;
update public.profiles set home_base = 'Vienna, Austria' where id = '33333333-3333-3333-3333-333333333343';
insert into public.trips (id, owner, name, state, ledger) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa43', '11111111-1111-1111-1111-111111111143',
   'TP43 A', '{"meta":{"homeBase":" Lisbon, Portugal "}}'::jsonb, '[]'::jsonb),
  ('cccccccc-cccc-cccc-cccc-cccccccccc43', '33333333-3333-3333-3333-333333333343',
   'TP43 C', '{"meta":{"homeBase":"Oslo, Norway"}}'::jsonb, '[]'::jsonb),
  ('dddddddd-dddd-dddd-dddd-dddddddddd43', '44444444-4444-4444-4444-444444444443',
   'TP43 D', '{"meta":{"homeBase":"  "}}'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;
insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa43', '22222222-2222-2222-2222-222222222243', 'editor')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2) The backfill, run again over the fixtures (it is 43's statement,
--    verbatim): the owner's journey fills an empty profile, trimmed; a member
--    who owns nothing stays empty; a home someone set is never overwritten; a
--    blank journey home fills nothing.
-- ---------------------------------------------------------------------------
update public.profiles p
set home_base = src.home
from (
  select distinct on (t.owner) t.owner, btrim(t.state->'meta'->>'homeBase') as home
  from public.trips t
  where coalesce(btrim(t.state->'meta'->>'homeBase'), '') <> ''
  order by t.owner, t.updated_at desc
) src
where p.id = src.owner
  and p.home_base is null;

do $$
declare
  a text; b text; c text; d text;
begin
  select home_base into a from public.profiles where id = '11111111-1111-1111-1111-111111111143';
  select home_base into b from public.profiles where id = '22222222-2222-2222-2222-222222222243';
  select home_base into c from public.profiles where id = '33333333-3333-3333-3333-333333333343';
  select home_base into d from public.profiles where id = '44444444-4444-4444-4444-444444444443';
  if a is distinct from 'Lisbon, Portugal' then
    raise exception 'TP43 FAIL: the owner''s journey home did not fill their profile (got %)', a;
  end if;
  if b is not null then
    raise exception 'TP43 FAIL: a member who owns no journey was given a home (%)', b;
  end if;
  if c is distinct from 'Vienna, Austria' then
    raise exception 'TP43 FAIL: a home someone set was overwritten (now %)', c;
  end if;
  if d is not null then
    raise exception 'TP43 FAIL: a blank journey home filled a profile (%)', d;
  end if;
  raise notice 'TP43 OK (2/3): the backfill fills only empty profiles, from owned journeys';
end $$;

create or replace function pg_temp.be(p_uid uuid, p_email text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'email', p_email, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create or replace function pg_temp.god() returns void
language sql as $$ select set_config('role', 'none', true); $$;

-- ---------------------------------------------------------------------------
-- 3) B sets their own home and cannot touch A's, although B can read A's row.
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
begin
  perform pg_temp.be('22222222-2222-2222-2222-222222222243', 'b@tp43.local');
  update public.profiles set home_base = 'Budapest, Hungary'
  where id = '22222222-2222-2222-2222-222222222243';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'TP43 FAIL: a person could not set their own home (% rows)', n;
  end if;
  if not exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111143') then
    raise exception 'TP43 FAIL: fixture — the travel partner''s profile is not readable, so the next check would prove nothing';
  end if;
  update public.profiles set home_base = 'Nowhere'
  where id = '11111111-1111-1111-1111-111111111143';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'TP43 FAIL: a person changed their travel partner''s home';
  end if;
  perform pg_temp.god();

  if (select home_base from public.profiles where id = '22222222-2222-2222-2222-222222222243') is distinct from 'Budapest, Hungary' then
    raise exception 'TP43 FAIL: the home a person set did not stick';
  end if;
  if (select home_base from public.profiles where id = '11111111-1111-1111-1111-111111111143') is distinct from 'Lisbon, Portugal' then
    raise exception 'TP43 FAIL: the travel partner''s home changed';
  end if;
  raise notice 'TP43 OK (3/3): a person sets their own home, and not their travel partner''s';
end $$;

rollback;
