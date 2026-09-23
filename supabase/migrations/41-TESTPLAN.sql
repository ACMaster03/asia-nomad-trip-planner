-- ============================================================================
-- 41-TESTPLAN.sql — the "Track spending" answer: the column is there, a new
-- account starts unanswered, and a person can set their own answer and
-- nobody else's, not even a travel partner's whose profile they can read.
-- Run against STAGING after 41. Rolls itself back.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) The column: boolean, nullable, no default. Null means "not asked yet";
--    a default would answer the question for everyone who never saw it.
-- ---------------------------------------------------------------------------
do $$
declare
  v_type text; v_nullable text; v_default text;
begin
  select data_type, is_nullable, column_default into v_type, v_nullable, v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'track_spending';
  if v_type is null then
    raise exception 'TP41 FAIL: profiles.track_spending does not exist — was 41 applied?';
  end if;
  if v_type <> 'boolean' then
    raise exception 'TP41 FAIL: track_spending is %, not boolean', v_type;
  end if;
  if v_nullable <> 'YES' then
    raise exception 'TP41 FAIL: track_spending is NOT NULL, so "not asked yet" cannot be stored';
  end if;
  if v_default is not null then
    raise exception 'TP41 FAIL: track_spending defaults to %, which answers the question for everyone', v_default;
  end if;
  raise notice 'TP41 OK (1/3): a nullable boolean with no default';
end $$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111141', 'a@tp41.local', now(), '{"first_name":"A"}'),
  ('22222222-2222-2222-2222-222222222241', 'b@tp41.local', now(), '{"first_name":"B"}')
on conflict (id) do nothing;
insert into public.profiles (id) values
  ('11111111-1111-1111-1111-111111111141'),
  ('22222222-2222-2222-2222-222222222241')
on conflict (id) do nothing;
-- B travels with A: co-members read each other's profile (06), which is the
-- case worth testing. A stranger's row is invisible anyway, so an update of
-- it proves nothing about profiles_update.
insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa41', '11111111-1111-1111-1111-111111111141',
        'TP41 Trip', '{}'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;
insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa41', '22222222-2222-2222-2222-222222222241', 'editor')
on conflict do nothing;

create or replace function pg_temp.be(p_uid uuid, p_email text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'email', p_email, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create or replace function pg_temp.god() returns void
language sql as $$ select set_config('role', 'none', true); $$;

-- ---------------------------------------------------------------------------
-- 2) A new account starts unanswered, so it will see the question.
-- ---------------------------------------------------------------------------
do $$
begin
  if (select track_spending from public.profiles
      where id = '11111111-1111-1111-1111-111111111141') is not null then
    raise exception 'TP41 FAIL: a new account is already answered and would never see the question';
  end if;
  raise notice 'TP41 OK (2/3): a new account starts unanswered';
end $$;

-- ---------------------------------------------------------------------------
-- 3) A person answers for themselves, changes their mind, and cannot touch
--    their travel partner's answer, although they can read that row.
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
  v boolean;
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111141', 'a@tp41.local');
  update public.profiles set track_spending = false
  where id = '11111111-1111-1111-1111-111111111141';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'TP41 FAIL: a person could not save their own answer (% rows)', n;
  end if;
  update public.profiles set track_spending = true
  where id = '11111111-1111-1111-1111-111111111141';
  if not exists (select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222241') then
    raise exception 'TP41 FAIL: fixture — the travel partner''s profile is not readable, so the next check would prove nothing';
  end if;
  update public.profiles set track_spending = true
  where id = '22222222-2222-2222-2222-222222222241';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'TP41 FAIL: a person changed their travel partner''s answer';
  end if;
  perform pg_temp.god();

  select track_spending into v from public.profiles where id = '11111111-1111-1111-1111-111111111141';
  if v is distinct from true then
    raise exception 'TP41 FAIL: the changed answer did not stick (%)', v;
  end if;
  if (select track_spending from public.profiles
      where id = '22222222-2222-2222-2222-222222222241') is not null then
    raise exception 'TP41 FAIL: the other account''s answer changed';
  end if;
  raise notice 'TP41 OK (3/3): a person sets their own answer, and not their travel partner''s';
end $$;

rollback;
