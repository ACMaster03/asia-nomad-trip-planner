-- ============================================================================
-- 37-TESTPLAN.sql — assertions for the notification matrix.
--
-- Run against STAGING after applying 33, 34, 35 and 37. Rolls itself back.
--
-- What must hold:
--   1. push_audience_event: the roster minus the author for every
--      visibility; the author's followers (any traveller's, for an arrival)
--      only for follower-visible posts on an open trip; roster members are
--      never counted twice; own_trip_posts / follow_posts / mute / 'off'
--      each remove exactly who they should; the copy fields are right.
--   2. push_audience_comment: the post author hears about comments, the
--      parent author about replies (reply wins when both apply), all_comments
--      widens to the roster, comments_on_mine / replies / mute opt out, the
--      commenter never hears their own, followers never hear threads.
--   3. push_audience_reaction: nobody by default; the post author once they
--      opt in; never the reactor.
--   4. notify_prefs is owner-only and mirrors onto profiles.
--   5. Grants: the three audiences are service_role-only, the helpers are
--      internal, every definer function pins search_path, both new triggers
--      exist.
-- ============================================================================

begin;

-- owner (1111) + partner (5555, editor) travel; viewer (6666) reads.
-- fan (2222) follows both, aunt (7777) follows only the partner, nosy (4444)
-- follows nobody.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111137', 'owner@tp37.local',   now(), '{"first_name":"Patrik"}'),
  ('55555555-5555-5555-5555-555555555537', 'partner@tp37.local', now(), '{"first_name":"Anna"}'),
  ('66666666-6666-6666-6666-666666666637', 'viewer@tp37.local',  now(), '{"first_name":"Viewer"}'),
  ('22222222-2222-2222-2222-222222222237', 'fan@tp37.local',     now(), '{"first_name":"Fan"}'),
  ('77777777-7777-7777-7777-777777777737', 'aunt@tp37.local',    now(), '{"first_name":"Aunt"}'),
  ('44444444-4444-4444-4444-444444444437', 'nosy@tp37.local',    now(), '{"first_name":"Nosy"}')
on conflict (id) do nothing;
insert into public.profiles (id) values
  ('11111111-1111-1111-1111-111111111137'), ('55555555-5555-5555-5555-555555555537'),
  ('66666666-6666-6666-6666-666666666637'), ('22222222-2222-2222-2222-222222222237'),
  ('77777777-7777-7777-7777-777777777737'), ('44444444-4444-4444-4444-444444444437')
on conflict (id) do nothing;
insert into public.trips (id, owner, name, state, ledger, follower_access)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37', '11111111-1111-1111-1111-111111111137', 'TP37 Trip',
        '{"meta":{"tripName":"TP37 Trip","startDate":"2026-09-01","endDate":"2026-12-01"},"segments":[]}'::jsonb,
        '[]'::jsonb, 'on')
on conflict (id) do nothing;
insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37', '55555555-5555-5555-5555-555555555537', 'editor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37', '66666666-6666-6666-6666-666666666637', 'viewer')
on conflict (trip_id, user_id) do update set role = excluded.role;
insert into public.trip_events (id, trip_id, author, kind, payload, visibility, occurred_at) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37',
   '11111111-1111-1111-1111-111111111137', 'checkin', '{"placeName":"Wat Pho"}', 'followers', now() - interval '3 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee372', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37',
   '11111111-1111-1111-1111-111111111137', 'note', '{"text":"PRIVATE"}', 'trip', now() - interval '2 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee373', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37',
   '55555555-5555-5555-5555-555555555537', 'arrived', '{"city":"Tokyo"}', 'followers', now() - interval '1 hour')
on conflict (id) do nothing;
insert into public.check_ins (event_id, trip_id, rating, comment)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37', 4, 'go early')
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
-- the user ids behind one reason, sorted — what every assertion compares
create or replace function pg_temp.who(j jsonb, p_reason text) returns uuid[]
language sql as $$
  select coalesce((select array_agg((t->>'user_id')::uuid order by (t->>'user_id')::uuid)
                   from jsonb_array_elements(j->'targets') t where t->>'reason' = p_reason), '{}'::uuid[]);
$$;

create temp table tp37 (k text primary key, v text);
grant select, insert on tp37 to authenticated, anon;

do $$
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111137', 'owner@tp37.local');
  insert into tp37 values ('token', public.create_share_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37', 'family'));
  perform pg_temp.be('22222222-2222-2222-2222-222222222237', 'fan@tp37.local');
  perform public.follow_by_token((select v from tp37 where k = 'token'), null);
  perform pg_temp.be('77777777-7777-7777-7777-777777777737', 'aunt@tp37.local');
  perform public.follow_by_token((select v from tp37 where k = 'token'), array['55555555-5555-5555-5555-555555555537'::uuid]);
  perform pg_temp.god();
end $$;

-- ---- 1) a new post ------------------------------------------------------------
do $$
declare j jsonb;
begin
  -- owner's follower-visible check-in: partner + viewer (roster), fan (follows owner)
  j := public.push_audience_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371');
  if pg_temp.who(j, 'trip') <> array['55555555-5555-5555-5555-555555555537', '66666666-6666-6666-6666-666666666637']::uuid[] then
    raise exception 'TP37-1 FAIL: roster audience wrong: %', j->'targets';
  end if;
  if pg_temp.who(j, 'follow') <> array['22222222-2222-2222-2222-222222222237']::uuid[] then
    raise exception 'TP37-1 FAIL: follower audience wrong (aunt follows only the partner): %', j->'targets';
  end if;
  if j->>'tripName' <> 'TP37 Trip' or j->>'authorName' <> 'Patrik' or j->>'title' <> 'Wat Pho'
     or j->>'rating' <> '4' or j->>'comment' <> 'go early' or j->>'kind' <> 'checkin' then
    raise exception 'TP37-1 FAIL: copy fields wrong: %', j;
  end if;

  -- private note: roster only
  j := public.push_audience_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeee372');
  if pg_temp.who(j, 'trip') <> array['55555555-5555-5555-5555-555555555537', '66666666-6666-6666-6666-666666666637']::uuid[]
     or pg_temp.who(j, 'follow') <> '{}'::uuid[] then
    raise exception 'TP37-1 FAIL: a private note reached followers: %', j->'targets';
  end if;

  -- partner's arrival: owner + viewer; every follower of any traveller
  j := public.push_audience_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeee373');
  if pg_temp.who(j, 'trip') <> array['11111111-1111-1111-1111-111111111137', '66666666-6666-6666-6666-666666666637']::uuid[]
     or pg_temp.who(j, 'follow') <> array['22222222-2222-2222-2222-222222222237', '77777777-7777-7777-7777-777777777737']::uuid[] then
    raise exception 'TP37-1 FAIL: arrival audience wrong: %', j->'targets';
  end if;
  if j->>'title' <> 'Arrived in Tokyo' or j->>'authorName' <> 'Anna' then
    raise exception 'TP37-1 FAIL: arrival copy wrong: %', j;
  end if;

  -- opt-outs, one at a time
  insert into public.notify_prefs (user_id, own_trip_posts) values ('66666666-6666-6666-6666-666666666637', false);
  insert into public.notify_prefs (user_id, follow_posts)   values ('22222222-2222-2222-2222-222222222237', false);
  j := public.push_audience_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371');
  if pg_temp.who(j, 'trip') <> array['55555555-5555-5555-5555-555555555537']::uuid[] or pg_temp.who(j, 'follow') <> '{}'::uuid[] then
    raise exception 'TP37-1 FAIL: preferences ignored: %', j->'targets';
  end if;
  delete from public.notify_prefs where user_id in ('66666666-6666-6666-6666-666666666637', '22222222-2222-2222-2222-222222222237');

  insert into public.trip_notify (user_id, trip_id, muted)
  values ('55555555-5555-5555-5555-555555555537', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37', true),
         ('22222222-2222-2222-2222-222222222237', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37', true);
  j := public.push_audience_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371');
  if pg_temp.who(j, 'trip') <> array['66666666-6666-6666-6666-666666666637']::uuid[] or pg_temp.who(j, 'follow') <> '{}'::uuid[] then
    raise exception 'TP37-1 FAIL: mute ignored: %', j->'targets';
  end if;
  delete from public.trip_notify;

  update public.trips set follower_access = 'off' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37';
  j := public.push_audience_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371');
  if pg_temp.who(j, 'follow') <> '{}'::uuid[] or jsonb_array_length(j->'targets') <> 2 then
    raise exception 'TP37-1 FAIL: a hidden trip still pushed to followers: %', j->'targets';
  end if;
  update public.trips set follower_access = 'on' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37';

  -- a blocked follower is out, on the blocker's posts
  perform pg_temp.be('11111111-1111-1111-1111-111111111137', 'owner@tp37.local');
  perform public.block_user('22222222-2222-2222-2222-222222222237');
  perform pg_temp.god();
  j := public.push_audience_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371');
  if pg_temp.who(j, 'follow') <> '{}'::uuid[] then
    raise exception 'TP37-1 FAIL: a blocked follower still hears: %', j->'targets';
  end if;
  -- ...and still hears the partner they follow (the block is per traveller)
  j := public.push_audience_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeee373');
  if pg_temp.who(j, 'follow') <> array['22222222-2222-2222-2222-222222222237', '77777777-7777-7777-7777-777777777737']::uuid[] then
    raise exception 'TP37-1 FAIL: block bled onto another traveller: %', j->'targets';
  end if;
  perform pg_temp.be('11111111-1111-1111-1111-111111111137', 'owner@tp37.local');
  perform public.unblock_user('22222222-2222-2222-2222-222222222237');
  perform pg_temp.be('22222222-2222-2222-2222-222222222237', 'fan@tp37.local');
  perform public.follow_by_token((select v from tp37 where k = 'token'), null); -- fan follows the owner again
  perform pg_temp.god();

  if public.push_audience_event('00000000-0000-0000-0000-000000000000') is not null then
    raise exception 'TP37-1 FAIL: unknown event is not null';
  end if;
  raise notice 'TP37-1 ok';
end $$;

-- ---- 2) comments ----------------------------------------------------------------
do $$
declare c1 uuid; c2 uuid; j jsonb;
begin
  -- fan comments on the owner's post: the owner hears, nobody else
  perform pg_temp.be('22222222-2222-2222-2222-222222222237', 'fan@tp37.local');
  c1 := (public.add_comment('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', 'Lovely!')->>'id')::uuid;
  perform pg_temp.god();
  j := public.push_audience_comment(c1);
  if pg_temp.who(j, 'comment') <> array['11111111-1111-1111-1111-111111111137']::uuid[] or pg_temp.who(j, 'reply') <> '{}'::uuid[] then
    raise exception 'TP37-2 FAIL: top-level comment audience wrong: %', j->'targets';
  end if;
  if j->>'authorName' <> 'Fan' or j->>'body' <> 'Lovely!' or j->>'title' <> 'Wat Pho' or j->>'event_id' <> 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee371' then
    raise exception 'TP37-2 FAIL: comment copy wrong: %', j;
  end if;

  -- the owner replies: the fan hears a reply; the owner does not hear their own
  perform pg_temp.be('11111111-1111-1111-1111-111111111137', 'owner@tp37.local');
  c2 := (public.add_comment('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', 'Thanks!', c1)->>'id')::uuid;
  perform pg_temp.god();
  j := public.push_audience_comment(c2);
  if pg_temp.who(j, 'reply') <> array['22222222-2222-2222-2222-222222222237']::uuid[] or jsonb_array_length(j->'targets') <> 1 then
    raise exception 'TP37-2 FAIL: reply audience wrong: %', j->'targets';
  end if;

  -- the partner replies: the fan hears a reply, the owner a comment
  perform pg_temp.be('55555555-5555-5555-5555-555555555537', 'partner@tp37.local');
  c2 := (public.add_comment('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', 'Agreed', c1)->>'id')::uuid;
  perform pg_temp.god();
  j := public.push_audience_comment(c2);
  if pg_temp.who(j, 'reply') <> array['22222222-2222-2222-2222-222222222237']::uuid[]
     or pg_temp.who(j, 'comment') <> array['11111111-1111-1111-1111-111111111137']::uuid[] then
    raise exception 'TP37-2 FAIL: partner reply audience wrong: %', j->'targets';
  end if;

  -- the partner widens the trip to every post: they now hear the fan's comments too
  insert into public.trip_notify (user_id, trip_id, all_comments)
  values ('55555555-5555-5555-5555-555555555537', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37', true);
  perform pg_temp.be('22222222-2222-2222-2222-222222222237', 'fan@tp37.local');
  c2 := (public.add_comment('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', 'Another')->>'id')::uuid;
  perform pg_temp.god();
  j := public.push_audience_comment(c2);
  if pg_temp.who(j, 'comment') <> array['11111111-1111-1111-1111-111111111137', '55555555-5555-5555-5555-555555555537']::uuid[] then
    raise exception 'TP37-2 FAIL: all_comments ignored: %', j->'targets';
  end if;

  -- the owner opts out of comments on their posts: only the partner is left
  insert into public.notify_prefs (user_id, comments_on_mine) values ('11111111-1111-1111-1111-111111111137', false);
  j := public.push_audience_comment(c2);
  if pg_temp.who(j, 'comment') <> array['55555555-5555-5555-5555-555555555537']::uuid[] then
    raise exception 'TP37-2 FAIL: comments_on_mine ignored: %', j->'targets';
  end if;
  delete from public.notify_prefs where user_id = '11111111-1111-1111-1111-111111111137';
  delete from public.trip_notify;

  -- the fan opts out of replies: the owner's reply reaches nobody
  insert into public.notify_prefs (user_id, replies) values ('22222222-2222-2222-2222-222222222237', false);
  perform pg_temp.be('11111111-1111-1111-1111-111111111137', 'owner@tp37.local');
  c2 := (public.add_comment('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', 'Again', c1)->>'id')::uuid;
  perform pg_temp.god();
  j := public.push_audience_comment(c2);
  if jsonb_array_length(j->'targets') <> 0 then
    raise exception 'TP37-2 FAIL: replies opt-out ignored: %', j->'targets';
  end if;
  delete from public.notify_prefs where user_id = '22222222-2222-2222-2222-222222222237';

  -- the fan mutes the trip: same reply, still nobody
  insert into public.trip_notify (user_id, trip_id, muted)
  values ('22222222-2222-2222-2222-222222222237', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37', true);
  j := public.push_audience_comment(c2);
  if jsonb_array_length(j->'targets') <> 0 then
    raise exception 'TP37-2 FAIL: mute ignored for a reply: %', j->'targets';
  end if;
  delete from public.trip_notify;

  -- a removed follower does not hear a reply to a comment they left behind
  delete from public.user_follows where follower_id = '22222222-2222-2222-2222-222222222237';
  j := public.push_audience_comment(c2);
  if jsonb_array_length(j->'targets') <> 0 then
    raise exception 'TP37-2 FAIL: a former follower still hears replies: %', j->'targets';
  end if;
  perform pg_temp.be('22222222-2222-2222-2222-222222222237', 'fan@tp37.local');
  perform public.follow_by_token((select v from tp37 where k = 'token'), null);
  perform pg_temp.god();

  -- deleted comment: nothing to say
  update public.event_comments set deleted_at = now(), body = '' where id = c2;
  if public.push_audience_comment(c2) is not null then
    raise exception 'TP37-2 FAIL: a deleted comment produced an audience';
  end if;
  raise notice 'TP37-2 ok';
end $$;

-- ---- 3) reactions ----------------------------------------------------------------
do $$
declare j jsonb;
begin
  perform pg_temp.be('22222222-2222-2222-2222-222222222237', 'fan@tp37.local');
  perform public.react('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', 'heart');
  perform pg_temp.god();
  j := public.push_audience_reaction('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', '22222222-2222-2222-2222-222222222237');
  if jsonb_array_length(j->'targets') <> 0 then
    raise exception 'TP37-3 FAIL: reactions are on by default: %', j->'targets';
  end if;
  if j->>'glyph' <> '❤️' or j->>'authorName' <> 'Fan' or j->>'title' <> 'Wat Pho' then
    raise exception 'TP37-3 FAIL: reaction copy wrong: %', j;
  end if;

  insert into public.notify_prefs (user_id, reactions) values ('11111111-1111-1111-1111-111111111137', true);
  j := public.push_audience_reaction('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', '22222222-2222-2222-2222-222222222237');
  if pg_temp.who(j, 'reaction') <> array['11111111-1111-1111-1111-111111111137']::uuid[] then
    raise exception 'TP37-3 FAIL: opted-in author not reached: %', j->'targets';
  end if;

  -- the author reacting to their own post: silence
  perform pg_temp.be('11111111-1111-1111-1111-111111111137', 'owner@tp37.local');
  perform public.react('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', 'clap');
  perform pg_temp.god();
  j := public.push_audience_reaction('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', '11111111-1111-1111-1111-111111111137');
  if jsonb_array_length(j->'targets') <> 0 then
    raise exception 'TP37-3 FAIL: author notified of own reaction: %', j->'targets';
  end if;

  -- muted trip wins
  insert into public.trip_notify (user_id, trip_id, muted)
  values ('11111111-1111-1111-1111-111111111137', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37', true);
  j := public.push_audience_reaction('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', '22222222-2222-2222-2222-222222222237');
  if jsonb_array_length(j->'targets') <> 0 then
    raise exception 'TP37-3 FAIL: mute ignored for a reaction: %', j->'targets';
  end if;
  delete from public.trip_notify;
  delete from public.notify_prefs where user_id = '11111111-1111-1111-1111-111111111137';

  if public.push_audience_reaction('eeeeeeee-eeee-eeee-eeee-eeeeeeeee371', '44444444-4444-4444-4444-444444444437') is not null then
    raise exception 'TP37-3 FAIL: a reaction that does not exist produced a row';
  end if;
  raise notice 'TP37-3 ok';
end $$;

-- ---- 4) notify_prefs: owner-only, mirrored ------------------------------------------
do $$
declare n int; v boolean;
begin
  perform pg_temp.be('22222222-2222-2222-2222-222222222237', 'fan@tp37.local');
  insert into public.notify_prefs (user_id, deadline_push, own_trip_posts) values (auth.uid(), false, true)
  on conflict (user_id) do update set deadline_push = excluded.deadline_push, own_trip_posts = excluded.own_trip_posts;
  update public.notify_prefs set own_trip_posts = false where user_id = auth.uid();
  perform pg_temp.god();
  select notify_deadline_push into v from public.profiles where id = '22222222-2222-2222-2222-222222222237';
  if v then raise exception 'TP37-4 FAIL: deadline_push not mirrored'; end if;
  select notify_event_push into v from public.profiles where id = '22222222-2222-2222-2222-222222222237';
  if v then raise exception 'TP37-4 FAIL: own_trip_posts not mirrored'; end if;
  if not public._notify_pref('22222222-2222-2222-2222-222222222237', 'follow_posts')
     or public._notify_pref('22222222-2222-2222-2222-222222222237', 'own_trip_posts')
     or public._notify_pref('44444444-4444-4444-4444-444444444437', 'reactions')
     or not public._notify_pref('44444444-4444-4444-4444-444444444437', 'replies') then
    raise exception 'TP37-4 FAIL: _notify_pref defaults wrong';
  end if;

  -- another person sees and touches nothing
  perform pg_temp.be('44444444-4444-4444-4444-444444444437', 'nosy@tp37.local');
  select count(*) into n from public.notify_prefs;
  if n <> 0 then raise exception 'TP37-4 FAIL: a stranger reads other people''s prefs'; end if;
  update public.notify_prefs set replies = false where user_id = '22222222-2222-2222-2222-222222222237';
  begin
    insert into public.notify_prefs (user_id) values ('22222222-2222-2222-2222-222222222237');
    raise exception 'TP37-4 FAIL: a stranger inserted someone else''s prefs';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.trip_notify (user_id, trip_id, muted)
    values ('22222222-2222-2222-2222-222222222237', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa37', true);
    raise exception 'TP37-4 FAIL: a stranger muted a trip for someone else';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.god();
  if (select replies from public.notify_prefs where user_id = '22222222-2222-2222-2222-222222222237') = false then
    raise exception 'TP37-4 FAIL: a stranger updated someone else''s prefs';
  end if;
  delete from public.notify_prefs;
  raise notice 'TP37-4 ok';
end $$;

-- ---- 5) grants, pins, triggers -----------------------------------------------------
do $$
declare bad text;
begin
  if not has_function_privilege('service_role', 'public.push_audience_event(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.push_audience_comment(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.push_audience_reaction(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.push_audience_event(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.push_audience_comment(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.push_audience_reaction(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.push_audience_event(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._notify_pref(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public._trip_muted(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._trip_roster(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._user_can_see_event(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._push_fanout_post(jsonb)', 'execute') then
    raise exception 'TP37-5 FAIL: grants wrong';
  end if;
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and p.proname in ('_notify_pref', '_trip_muted', '_trip_roster', '_user_can_see_event',
                      'push_audience_event', 'push_audience_comment', 'push_audience_reaction',
                      '_push_fanout_post', 'notify_push_fanout', 'notify_comment_fanout',
                      'notify_reaction_fanout', 'notify_prefs_mirror')
    and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
  if bad is not null then raise exception 'TP37-5 FAIL: search_path not pinned on: %', bad; end if;
  if not exists (select 1 from pg_trigger where tgname = 'event_comments_push_fanout')
     or not exists (select 1 from pg_trigger where tgname = 'event_reactions_push_fanout')
     or not exists (select 1 from pg_trigger where tgname = 'trip_events_push_fanout') then
    raise exception 'TP37-5 FAIL: a fan-out trigger is missing';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname in ('notify_prefs', 'trip_notify') and c.relrowsecurity)
     or (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname in ('notify_prefs', 'trip_notify') and c.relrowsecurity) <> 2 then
    raise exception 'TP37-5 FAIL: RLS off on a preference table';
  end if;
  raise notice 'TP37-5 ok';
end $$;

rollback;
