-- ============================================================================
-- 35-TESTPLAN.sql — assertions for the single-post readers.
--
-- Run against STAGING after applying 33, 34 and 35. Rolls itself back.
--
-- What must hold:
--   1. The feed projection did not move: shared_feed's rows equal what
--      _event_row_json produces, and a follower's following_feed row equals
--      followed_event for the same post.
--   2. followed_event: a traveller reads their own private note, a follower
--      reads a follower-visible post by someone they follow and nothing else,
--      a stranger gets null. shared_event: the link reads follower-visible
--      posts of its trip only; a paused link reads nothing.
--   3. Grants: anon can call shared_event only; helpers are internal; every
--      definer function pins search_path.
-- ============================================================================

begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111135', 'owner@tp35.local', now(), '{"first_name":"Patrik"}'),
  ('22222222-2222-2222-2222-222222222235', 'fan@tp35.local',   now(), '{"first_name":"Fan"}'),
  ('44444444-4444-4444-4444-444444444435', 'nosy@tp35.local',  now(), '{"first_name":"Nosy"}')
on conflict (id) do nothing;
insert into public.profiles (id) values
  ('11111111-1111-1111-1111-111111111135'), ('22222222-2222-2222-2222-222222222235'),
  ('44444444-4444-4444-4444-444444444435')
on conflict (id) do nothing;
insert into public.trips (id, owner, name, state, ledger, follower_access)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa35', '11111111-1111-1111-1111-111111111135', 'TP35 Trip',
        '{"meta":{"tripName":"TP35 Trip","startDate":"2026-09-01","endDate":"2026-12-01"},"segments":[]}'::jsonb,
        '[]'::jsonb, 'on')
on conflict (id) do nothing;
insert into public.trip_events (id, trip_id, author, kind, payload, visibility, occurred_at) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee351', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa35',
   '11111111-1111-1111-1111-111111111135', 'note', '{"text":"PRIVATE"}', 'trip', now() - interval '2 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee352', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa35',
   '11111111-1111-1111-1111-111111111135', 'checkin', '{"placeName":"Wat Pho","photos":["p/1.jpg"]}', 'followers', now() - interval '1 hour')
on conflict (id) do nothing;
insert into public.check_ins (event_id, trip_id, rating, comment)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee352', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa35', 5, 'go before 9')
on conflict (event_id) do nothing;

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

create temp table tp35 (k text primary key, v text);
grant select, insert on tp35 to authenticated;
do $$
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111135', 'owner@tp35.local');
  insert into tp35 values ('token', public.create_share_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa35', 'family'));
  perform pg_temp.be('22222222-2222-2222-2222-222222222235', 'fan@tp35.local');
  perform public.follow_by_token((select v from tp35 where k = 'token'), null);
  perform pg_temp.god();
end $$;

-- ---- 1) the projection did not move ---------------------------------------
do $$
declare feed jsonb; one jsonb; tok text;
begin
  tok := (select v from tp35 where k = 'token');
  perform pg_temp.anon();
  feed := public.shared_feed(tok);
  one  := public.shared_event(tok, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee352');
  if jsonb_array_length(feed) <> 1 or (feed->0) <> (one - 'trip_id' - 'tripName') then
    raise exception 'TP35-1 FAIL: shared_event differs from the feed row: feed=% one=%', feed, one;
  end if;
  if one->>'tripName' <> 'TP35 Trip' or one->>'authorName' <> 'Patrik' or one->>'rating' <> '5'
     or one->'payload'->>'placeName' <> 'Wat Pho' or one->'payload'->'photos'->>0 <> 'p/1.jpg' then
    raise exception 'TP35-1 FAIL: row shape wrong: %', one;
  end if;
  perform pg_temp.be('22222222-2222-2222-2222-222222222235', 'fan@tp35.local');
  if (public.following_feed(30, null)->0) <> public.followed_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeee352') then
    raise exception 'TP35-1 FAIL: followed_event differs from following_feed row';
  end if;
  perform pg_temp.god();
  raise notice 'TP35-1 ok';
end $$;

-- ---- 2) who reads what -------------------------------------------------------
do $$
declare tok text;
begin
  tok := (select v from tp35 where k = 'token');
  perform pg_temp.be('11111111-1111-1111-1111-111111111135', 'owner@tp35.local');
  if (public.followed_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeee351')->'payload'->>'text') <> 'PRIVATE' then
    raise exception 'TP35-2 FAIL: traveller cannot read own private note';
  end if;
  perform pg_temp.be('22222222-2222-2222-2222-222222222235', 'fan@tp35.local');
  if public.followed_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeee351') is not null then
    raise exception 'TP35-2 FAIL: follower read a private note';
  end if;
  perform pg_temp.be('44444444-4444-4444-4444-444444444435', 'nosy@tp35.local');
  if public.followed_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeee352') is not null then
    raise exception 'TP35-2 FAIL: stranger read a post';
  end if;
  perform pg_temp.anon();
  if public.shared_event(tok, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee351') is not null
     or public.shared_event('bad', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee352') is not null then
    raise exception 'TP35-2 FAIL: anon read what it should not';
  end if;
  perform pg_temp.god();
  update public.trip_shares set paused_at = now() where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa35';
  perform pg_temp.anon();
  if public.shared_event(tok, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee352') is not null then
    raise exception 'TP35-2 FAIL: paused link read a post';
  end if;
  perform pg_temp.god();
  raise notice 'TP35-2 ok';
end $$;

-- ---- 3) grants ---------------------------------------------------------------
do $$
declare bad text;
begin
  if has_function_privilege('anon', 'public.followed_event(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._event_row_json(public.trip_events)', 'execute')
     or has_function_privilege('authenticated', 'public._trip_feed_core(uuid[], uuid[], timestamptz, int)', 'execute')
     or not has_function_privilege('anon', 'public.shared_event(text, uuid)', 'execute') then
    raise exception 'TP35-3 FAIL: grants wrong';
  end if;
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and p.proname in ('_event_row_json', '_trip_feed_core', 'followed_event', 'shared_event')
    and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
  if bad is not null then raise exception 'TP35-3 FAIL: search_path not pinned on: %', bad; end if;
  raise notice 'TP35-3 ok';
end $$;

rollback;
