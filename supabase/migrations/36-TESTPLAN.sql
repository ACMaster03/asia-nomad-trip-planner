-- ============================================================================
-- 36-TESTPLAN.sql — assertions for follow-link rotation.
--
-- Run against STAGING after applying 33 and 36. Rolls itself back.
--
-- What must hold:
--   1. After rotate_share_link(): the old token is dead for anonymous
--      readers, the new token works, the row keeps its id, and the push
--      subscription and the account follow made through the old URL survive.
--   2. A non-editor is refused; a revoked link cannot be rotated.
--   3. Grants: anon cannot call it; search_path is pinned.
-- ============================================================================

begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111136', 'owner@tp36.local', now(), '{"first_name":"Patrik"}'),
  ('22222222-2222-2222-2222-222222222236', 'fan@tp36.local',   now(), '{"first_name":"Fan"}'),
  ('44444444-4444-4444-4444-444444444436', 'nosy@tp36.local',  now(), '{"first_name":"Nosy"}')
on conflict (id) do nothing;
insert into public.profiles (id) values
  ('11111111-1111-1111-1111-111111111136'), ('22222222-2222-2222-2222-222222222236'),
  ('44444444-4444-4444-4444-444444444436')
on conflict (id) do nothing;
insert into public.trips (id, owner, name, state, ledger, follower_access)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa36', '11111111-1111-1111-1111-111111111136', 'TP36 Trip',
        '{"meta":{"tripName":"TP36 Trip","startDate":"2026-09-01","endDate":"2026-12-01"},"segments":[]}'::jsonb,
        '[]'::jsonb, 'on')
on conflict (id) do nothing;

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

create temp table tp36 (k text primary key, v text);
grant select, insert on tp36 to authenticated, anon;

-- ---- fixtures: one link, one anonymous push device, one account follower ----
do $$
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111136', 'owner@tp36.local');
  insert into tp36 values ('old', public.create_share_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa36', 'family'));
  perform pg_temp.anon();
  perform public.subscribe_push((select v from tp36 where k = 'old'), 'https://push.example/tp36', 'k', 'a');
  perform pg_temp.be('22222222-2222-2222-2222-222222222236', 'fan@tp36.local');
  perform public.follow_by_token((select v from tp36 where k = 'old'), null);
  perform pg_temp.god();
  insert into tp36 select 'share_id', s.id::text from public.trip_shares s where s.trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa36';
end $$;

-- ---- 1) rotation: old URL dead, new URL live, everything keyed by id kept ----
do $$
declare v_share uuid; v_old text; v_new text; v_prefix text;
begin
  v_share := (select v from tp36 where k = 'share_id')::uuid;
  v_old   := (select v from tp36 where k = 'old');

  perform pg_temp.be('11111111-1111-1111-1111-111111111136', 'owner@tp36.local');
  v_new := public.rotate_share_link(v_share);
  if v_new is null or length(v_new) <> 64 or v_new = v_old then
    raise exception 'TP36-1 FAIL: rotate returned a bad token: %', v_new;
  end if;
  perform pg_temp.god();

  if (select count(*) from public.trip_shares where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa36') <> 1 then
    raise exception 'TP36-1 FAIL: rotation minted a second row';
  end if;
  if (select id from public._share_for_token(v_old)) is not null then
    raise exception 'TP36-1 FAIL: old token still resolves';
  end if;
  if (select id from public._share_for_token(v_new)) <> v_share then
    raise exception 'TP36-1 FAIL: new token does not resolve to the same row';
  end if;
  select token_prefix into v_prefix from public.trip_shares where id = v_share;
  if v_prefix <> left(v_new, 6) then
    raise exception 'TP36-1 FAIL: token_prefix not updated';
  end if;
  if (select rotated_at from public.trip_shares where id = v_share) is null then
    raise exception 'TP36-1 FAIL: rotated_at not set';
  end if;
  if (select count(*) from public.push_subscriptions where share_id = v_share) <> 1 then
    raise exception 'TP36-1 FAIL: push subscription lost';
  end if;
  if (select count(*) from public.user_follows where via_share_id = v_share
        and follower_id = '22222222-2222-2222-2222-222222222236') <> 1 then
    raise exception 'TP36-1 FAIL: account follow lost';
  end if;

  perform pg_temp.anon();
  if public.shared_trip_summary(v_old) is not null then
    raise exception 'TP36-1 FAIL: anon still reads through the old token';
  end if;
  if public.shared_trip_summary(v_new)->>'tripName' <> 'TP36 Trip' then
    raise exception 'TP36-1 FAIL: anon cannot read through the new token';
  end if;
  perform pg_temp.god();
  raise notice 'TP36-1 ok';
end $$;

-- ---- 2) refusals --------------------------------------------------------------
do $$
declare v_share uuid; v_ok boolean := false;
begin
  v_share := (select v from tp36 where k = 'share_id')::uuid;
  perform pg_temp.be('44444444-4444-4444-4444-444444444436', 'nosy@tp36.local');
  begin
    perform public.rotate_share_link(v_share);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'TP36-2 FAIL: a stranger rotated the link'; end if;

  perform pg_temp.be('22222222-2222-2222-2222-222222222236', 'fan@tp36.local');
  v_ok := false;
  begin
    perform public.rotate_share_link(v_share);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'TP36-2 FAIL: a follower rotated the link'; end if;

  perform pg_temp.god();
  update public.trip_shares set revoked_at = now() where id = v_share;
  perform pg_temp.be('11111111-1111-1111-1111-111111111136', 'owner@tp36.local');
  v_ok := false;
  begin
    perform public.rotate_share_link(v_share);
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'TP36-2 FAIL: a revoked link was rotated'; end if;
  perform pg_temp.god();
  raise notice 'TP36-2 ok';
end $$;

-- ---- 3) grants ---------------------------------------------------------------
do $$
begin
  if has_function_privilege('anon', 'public.rotate_share_link(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.rotate_share_link(uuid)', 'execute') then
    raise exception 'TP36-3 FAIL: grants wrong';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rotate_share_link' and p.prosecdef
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) then
    raise exception 'TP36-3 FAIL: search_path not pinned';
  end if;
  raise notice 'TP36-3 ok';
end $$;

rollback;
