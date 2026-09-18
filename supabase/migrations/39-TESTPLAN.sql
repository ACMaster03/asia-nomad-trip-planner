-- ============================================================================
-- 39-TESTPLAN.sql — an expired link cannot be rotated; a live one still can.
-- Run against STAGING after 36 and 39. Rolls itself back.
-- ============================================================================

begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111139', 'owner@tp39.local', now(), '{"first_name":"Patrik"}')
on conflict (id) do nothing;
insert into public.profiles (id) values ('11111111-1111-1111-1111-111111111139')
on conflict (id) do nothing;
insert into public.trips (id, owner, name, state, ledger, follower_access)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa39', '11111111-1111-1111-1111-111111111139', 'TP39 Trip',
        '{"meta":{"tripName":"TP39 Trip","startDate":"2026-09-01","endDate":"2026-12-01"},"segments":[]}'::jsonb,
        '[]'::jsonb, 'on')
on conflict (id) do nothing;

create or replace function pg_temp.be(p_uid uuid, p_email text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'email', p_email, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create or replace function pg_temp.god() returns void
language sql as $$ select set_config('role', 'none', true); $$;

do $$
declare v_live uuid; v_dead uuid; v_ok boolean := false; v_new text;
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111139', 'owner@tp39.local');
  perform public.create_share_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa39', 'live', now() + interval '1 day');
  perform public.create_share_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa39', 'dead', now() + interval '1 day');
  perform pg_temp.god();
  select id into v_live from public.trip_shares where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa39' and label = 'live';
  select id into v_dead from public.trip_shares where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa39' and label = 'dead';
  update public.trip_shares set expires_at = now() - interval '1 minute' where id = v_dead;

  perform pg_temp.be('11111111-1111-1111-1111-111111111139', 'owner@tp39.local');
  begin
    perform public.rotate_share_link(v_dead);
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'TP39 FAIL: an expired link was rotated'; end if;

  v_new := public.rotate_share_link(v_live);
  if v_new is null or length(v_new) <> 64 then
    raise exception 'TP39 FAIL: a live link with a future expiry could not be rotated';
  end if;
  perform pg_temp.god();
  if (select rotated_at from public.trip_shares where id = v_dead) is not null then
    raise exception 'TP39 FAIL: the expired row was touched';
  end if;
  raise notice 'TP39 ok';
end $$;

rollback;
