-- ============================================================================
-- 48-TESTPLAN.sql — the traveller's own side of the feed (journey_feed).
-- Run against STAGING after 48. Rolls itself back.
--
-- In the Supabase SQL editor a pass is "Success" with no error; any failure
-- stops with an error that starts "TP48 FAIL".
-- ============================================================================

begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111148', 'owner@tp48.local',    now(), '{"first_name":"Patrik"}'),
  ('22222222-2222-2222-2222-222222222248', 'editor@tp48.local',   now(), '{"first_name":"Petra"}'),
  ('33333333-3333-3333-3333-333333333348', 'mum@tp48.local',      now(), '{"first_name":"Mum"}'),
  ('44444444-4444-4444-4444-444444444448', 'stranger@tp48.local', now(), '{"first_name":"Zed"}'),
  ('55555555-5555-5555-5555-555555555548', 'blocked@tp48.local',  now(), '{"first_name":"Troll"}')
on conflict (id) do nothing;

insert into public.trips (id, owner, name, state, ledger, follower_access)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', '11111111-1111-1111-1111-111111111148', 'TP48 Asia',
        '{"meta":{"tripName":"TP48 Asia","startDate":"2026-09-01"},"segments":[]}'::jsonb, '[]'::jsonb, 'on')
on conflict (id) do nothing;

insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', '22222222-2222-2222-2222-222222222248', 'editor')
on conflict do nothing;

-- Mum follows Patrik (and so sees the journey's follower-visible posts).
insert into public.user_follows (follower_id, followee_id) values
  ('33333333-3333-3333-3333-333333333348', '11111111-1111-1111-1111-111111111148'),
  ('55555555-5555-5555-5555-555555555548', '11111111-1111-1111-1111-111111111148')
on conflict do nothing;
insert into public.user_blocks (blocker_id, blocked_id) values
  ('11111111-1111-1111-1111-111111111148', '55555555-5555-5555-5555-555555555548')
on conflict do nothing;

-- Four posts, oldest first: an arrival, Petra's check-in, a trip-only note, Patrik's check-in.
insert into public.trip_events (id, trip_id, author, kind, payload, visibility, occurred_at) values
  ('e0000001-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', '11111111-1111-1111-1111-111111111148',
   'arrived', '{"city":"Hanoi"}', 'followers', '2026-09-30 10:00+00'),
  ('e0000002-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', '22222222-2222-2222-2222-222222222248',
   'checkin', '{"placeName":"Hoan Kiem Lake","photos":["t/p1.jpg"]}', 'followers', '2026-10-02 07:00+00'),
  ('e0000003-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', '22222222-2222-2222-2222-222222222248',
   'note', '{"text":"Just for us"}', 'trip', '2026-10-05 12:00+00'),
  ('e0000004-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', '11111111-1111-1111-1111-111111111148',
   'checkin', '{"placeName":"Train Street","secret":"x"}', 'followers', '2026-10-09 12:10+00')
on conflict (id) do nothing;
insert into public.check_ins (event_id, trip_id, rating, comment) values
  ('e0000004-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', 5, 'Rainy and perfect.')
on conflict do nothing;

-- What people left: Mum ❤️ and comments on Train Street, Petra 😮 on it, Patrik ❤️ Petra's lake,
-- Mum's deleted comment, and the blocked account's reaction and comment.
insert into public.event_reactions (event_id, trip_id, user_id, kind, created_at) values
  ('e0000004-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', '33333333-3333-3333-3333-333333333348', 'heart', '2026-10-09 13:00+00'),
  ('e0000004-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', '22222222-2222-2222-2222-222222222248', 'wow',   '2026-10-09 13:05+00'),
  ('e0000004-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', '55555555-5555-5555-5555-555555555548', 'laugh', '2026-10-09 13:06+00'),
  ('e0000002-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', '11111111-1111-1111-1111-111111111148', 'heart', '2026-10-02 08:00+00')
on conflict do nothing;
insert into public.event_comments (id, event_id, trip_id, author, body, created_at, deleted_at) values
  ('c0000001-0000-0000-0000-000000000048', 'e0000004-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48',
   '33333333-3333-3333-3333-333333333348', 'How close does it get?', '2026-10-09 14:00+00', null),
  ('c0000002-0000-0000-0000-000000000048', 'e0000004-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48',
   '33333333-3333-3333-3333-333333333348', 'Oops, wrong post', '2026-10-09 14:01+00', '2026-10-09 14:02+00'),
  ('c0000003-0000-0000-0000-000000000048', 'e0000004-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48',
   '55555555-5555-5555-5555-555555555548', 'Spam', '2026-10-09 14:03+00', null),
  ('c0000004-0000-0000-0000-000000000048', 'e0000004-0000-0000-0000-000000000048', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48',
   '11111111-1111-1111-1111-111111111148', 'Close enough to step back.', '2026-10-09 15:00+00', null)
on conflict (id) do nothing;
update public.event_comments set parent_id = 'c0000001-0000-0000-0000-000000000048'
 where id = 'c0000004-0000-0000-0000-000000000048';

create or replace function pg_temp.be(p_uid uuid, p_email text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'email', p_email, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create or replace function pg_temp.god() returns void
language sql as $$ select set_config('role', 'none', true); $$;

do $$
declare
  v jsonb;
  p jsonb;
  a jsonb;
  v_ids text[];
begin
  -- 1) The owner gets the four posts, newest first, the trip-only note among them.
  perform pg_temp.be('11111111-1111-1111-1111-111111111148', 'owner@tp48.local');
  v := public.journey_feed('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48');
  perform pg_temp.god();
  if v is null then raise exception 'TP48 FAIL: the owner got nothing'; end if;
  select array_agg(e->>'id' order by ord) into v_ids
    from jsonb_array_elements(v->'posts') with ordinality as t(e, ord);
  if v_ids <> array['e0000004-0000-0000-0000-000000000048', 'e0000003-0000-0000-0000-000000000048',
                    'e0000002-0000-0000-0000-000000000048', 'e0000001-0000-0000-0000-000000000048'] then
    raise exception 'TP48 FAIL: posts in the wrong order or missing: %', v_ids;
  end if;

  -- 2) Train Street: the follower feed's shape, its visibility, a tally of three kinds
  --    (the blocked account's reaction counts, as in feed_social), one live comment of
  --    Mum's plus Patrik's reply, and no payload field beyond the projection.
  p := v->'posts'->0;
  if p->>'kind' <> 'checkin' or p->'payload'->>'placeName' <> 'Train Street'
     or (p->>'rating')::int <> 5 or p->>'comment' <> 'Rainy and perfect.'
     or p->>'authorName' <> 'Patrik' or p->>'visibility' <> 'followers' then
    raise exception 'TP48 FAIL: Train Street is wrong: %', p;
  end if;
  if p::text ~ 'secret' then raise exception 'TP48 FAIL: a raw payload field leaked: %', p; end if;
  if (p->>'commentCount')::int <> 3 then
    raise exception 'TP48 FAIL: expected 3 live comments on Train Street, got %', p->>'commentCount';
  end if;
  if jsonb_array_length(p->'tally') <> 3 or p ? 'mine' then
    raise exception 'TP48 FAIL: Train Street tally or mine is wrong: %', p;
  end if;
  if (v->'posts'->2)->>'mine' <> 'heart' or (v->'posts'->2)->'payload'->'photos'->>0 <> 't/p1.jpg' then
    raise exception 'TP48 FAIL: the lake should carry Patrik''s heart and its photo: %', v->'posts'->2;
  end if;
  if (v->'posts'->1)->>'visibility' <> 'trip' then
    raise exception 'TP48 FAIL: the note should say it is trip-only';
  end if;

  -- 3) Activity for the owner: Mum's comment, Petra's 😮, Mum's ❤️, newest first. Not his own
  --    reply or heart, not the deleted comment, nothing from the account he blocked.
  select array_agg(e->>'kind' || ':' || (e->>'name') order by ord) into v_ids
    from jsonb_array_elements(v->'activity') with ordinality as t(e, ord);
  if v_ids <> array['comment:Mum', 'reaction:Petra', 'reaction:Mum'] then
    raise exception 'TP48 FAIL: the owner''s activity is wrong: %', v_ids;
  end if;
  a := v->'activity'->0;
  if a->>'body' <> 'How close does it get?' or a->>'event_id' <> 'e0000004-0000-0000-0000-000000000048'
     or a->'post'->>'place' <> 'Train Street' or a->'post'->>'authorName' <> 'Patrik' or a->>'at' is null then
    raise exception 'TP48 FAIL: the comment row is wrong: %', a;
  end if;
  if (v->'activity'->1)->>'reaction' <> 'wow' then
    raise exception 'TP48 FAIL: Petra''s reaction should be wow: %', v->'activity'->1;
  end if;
  if v::text ~* 'troll|spam|oops' then
    raise exception 'TP48 FAIL: a blocked account or a deleted comment reached the owner';
  end if;

  -- 4) Petra (an editor) sees Patrik's heart on her lake and his reply; the blocked account,
  --    which only Patrik blocked, reaches her. Not her own 😮.
  perform pg_temp.be('22222222-2222-2222-2222-222222222248', 'editor@tp48.local');
  v := public.journey_feed('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48');
  perform pg_temp.god();
  select array_agg(e->>'kind' || ':' || (e->>'name') order by ord) into v_ids
    from jsonb_array_elements(v->'activity') with ordinality as t(e, ord);
  if v_ids <> array['comment:Patrik', 'comment:Troll', 'comment:Mum', 'reaction:Troll', 'reaction:Mum', 'reaction:Patrik'] then
    raise exception 'TP48 FAIL: the editor''s activity is wrong: %', v_ids;
  end if;
  if (v->'activity'->0)->>'parent_id' <> 'c0000001-0000-0000-0000-000000000048' then
    raise exception 'TP48 FAIL: the reply lost its parent';
  end if;

  -- 5) A follower and a stranger get nothing, and anon cannot call it.
  perform pg_temp.be('33333333-3333-3333-3333-333333333348', 'mum@tp48.local');
  if public.journey_feed('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48') is not null then
    raise exception 'TP48 FAIL: a follower got the travellers'' view';
  end if;
  perform pg_temp.be('44444444-4444-4444-4444-444444444448', 'stranger@tp48.local');
  if public.journey_feed('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48') is not null then
    raise exception 'TP48 FAIL: a stranger got the journey';
  end if;
  perform pg_temp.god();
  if has_function_privilege('anon', 'public.journey_feed(uuid, integer, timestamp with time zone)', 'EXECUTE') then
    raise exception 'TP48 FAIL: anon can call journey_feed';
  end if;

  -- 6) Paging: two at a time, then the rest before the second's time; no activity on page 2.
  perform pg_temp.be('11111111-1111-1111-1111-111111111148', 'owner@tp48.local');
  v := public.journey_feed('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', 2);
  if jsonb_array_length(v->'posts') <> 2 then
    raise exception 'TP48 FAIL: p_limit 2 gave % posts', jsonb_array_length(v->'posts');
  end if;
  v := public.journey_feed('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48', 2, ((v->'posts'->1)->>'occurred_at')::timestamptz);
  if jsonb_array_length(v->'posts') <> 2 or (v->'posts'->0)->>'id' <> 'e0000002-0000-0000-0000-000000000048'
     or jsonb_array_length(v->'activity') <> 0 then
    raise exception 'TP48 FAIL: page 2 is wrong: %', v;
  end if;

  -- 7) A journey that does not exist is nothing, not an error.
  if public.journey_feed('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb48') is not null then
    raise exception 'TP48 FAIL: a missing journey returned something';
  end if;
  perform pg_temp.god();
end $$;

rollback;
