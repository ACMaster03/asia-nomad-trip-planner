-- ============================================================================
-- 34-TESTPLAN.sql — assertions for social interactions (reactions, comments,
-- followers, blocks).
--
-- Run against STAGING after applying 33 and 34. Every block raises on failure;
-- a clean run means every assertion held. Rolls itself back.
--
-- What must hold:
--   1. Reactions: six kinds readable by anon; a follower can react to a post
--      they can see, sees only their own reaction, never a tally; a traveller
--      sees the tally and who reacted; a second react() replaces, null clears;
--      a stranger and a follower of the wrong traveller are refused.
--   2. Comments: a follower writes a top-level comment, a traveller replies,
--      a reply to a reply is refused, empty and oversized bodies are refused;
--      the thread reads in order for a follower, for a traveller and for an
--      anonymous link holder alike; a private post's thread is null for all
--      but travellers; the author and a traveller can delete, a bystander
--      cannot; a deleted parent with a live reply stays as a placeholder,
--      a deleted leaf vanishes; counts follow.
--   3. Reports: a visible comment can be reported once per person; only an
--      admin reads comment_reports.
--   4. Followers: my_followers() lists names and the location only from trips
--      the follower opened to followers; the followee can remove a follower
--      by plain delete; block_user() ends the follow and shuts the door until
--      unblock_user(); my_blocked() names them.
--   5. my_following() carries currentCountry.
--   6. Grants: no table policy references can_follow_trip or _can_see_event;
--      anon can call only the two shared_* additions; every new definer
--      function pins search_path; the interaction tables have RLS and no
--      policies except the two intended ones.
-- ============================================================================

begin;

-- ---- fixtures ---------------------------------------------------------------
-- owner (1111) + partner (5555, editor) travel. fan (2222) follows both,
-- aunt (7777) follows only the partner, nosy (4444) follows nobody,
-- admin (8888) is an admin who follows nobody.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111134', 'owner@tp34.local',   now(), '{"first_name":"Patrik"}'),
  ('55555555-5555-5555-5555-555555555534', 'partner@tp34.local', now(), '{"first_name":"Anna"}'),
  ('22222222-2222-2222-2222-222222222234', 'fan@tp34.local',     now(), '{"first_name":"Fan"}'),
  ('77777777-7777-7777-7777-777777777734', 'aunt@tp34.local',    now(), '{"first_name":"Aunt"}'),
  ('44444444-4444-4444-4444-444444444434', 'nosy@tp34.local',    now(), '{"first_name":"Nosy"}'),
  ('88888888-8888-8888-8888-888888888834', 'admin@tp34.local',   now(), '{"first_name":"Admin"}')
on conflict (id) do nothing;
insert into public.profiles (id, is_admin) values
  ('11111111-1111-1111-1111-111111111134', false), ('55555555-5555-5555-5555-555555555534', false),
  ('22222222-2222-2222-2222-222222222234', false), ('77777777-7777-7777-7777-777777777734', false),
  ('44444444-4444-4444-4444-444444444434', false), ('88888888-8888-8888-8888-888888888834', true)
on conflict (id) do update set is_admin = excluded.is_admin;

insert into public.trips (id, owner, name, state, ledger, follower_access)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa34',
        '11111111-1111-1111-1111-111111111134', 'TP34 Trip',
        '{"meta":{"tripName":"TP34 Trip","startDate":"2026-09-01","endDate":"2026-12-01"},
          "segments":[
            {"city":"Bangkok","country":"Thailand","arrive":"2026-09-01","depart":"2027-01-01"}]}'::jsonb,
        '[]'::jsonb, 'on')
on conflict (id) do nothing;
insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa34', '55555555-5555-5555-5555-555555555534', 'editor')
on conflict (trip_id, user_id) do update set role = excluded.role;
-- the fan also travels, on a trip they have NOT opened to followers
insert into public.trips (id, owner, name, state, ledger, follower_access)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb34',
        '22222222-2222-2222-2222-222222222234', 'TP34 Fan Trip',
        '{"meta":{"tripName":"TP34 Fan Trip","startDate":"2026-09-01","endDate":"2026-12-01"},
          "segments":[{"city":"Lisbon","country":"Portugal","arrive":"2026-09-01","depart":"2027-01-01"}]}'::jsonb,
        '[]'::jsonb, 'off')
on conflict (id) do nothing;

insert into public.trip_events (id, trip_id, author, kind, payload, visibility, occurred_at) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee341', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa34',
   '11111111-1111-1111-1111-111111111134', 'note', '{"text":"PRIVATE"}', 'trip', now() - interval '4 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa34',
   '11111111-1111-1111-1111-111111111134', 'checkin', '{"placeName":"Wat Pho"}', 'followers', now() - interval '3 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee343', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa34',
   '55555555-5555-5555-5555-555555555534', 'checkin', '{"placeName":"Mango sticky rice"}', 'followers', now() - interval '2 hours')
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

create temp table tp34 (k text primary key, v text);
grant select, insert, update on tp34 to authenticated;
do $$
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111134', 'owner@tp34.local');
  insert into tp34 values ('token', public.create_share_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa34', 'family'));
  perform pg_temp.be('22222222-2222-2222-2222-222222222234', 'fan@tp34.local');
  perform public.follow_by_token((select v from tp34 where k = 'token'), null);
  perform pg_temp.be('77777777-7777-7777-7777-777777777734', 'aunt@tp34.local');
  perform public.follow_by_token((select v from tp34 where k = 'token'),
                                 array['55555555-5555-5555-5555-555555555534']::uuid[]);
  perform pg_temp.god();
end $$;

-- ---- 1) reactions ------------------------------------------------------------
do $$
declare r jsonb; s jsonb;
begin
  perform pg_temp.anon();
  if (select count(*) from public.reaction_kinds) <> 6 then
    raise exception 'TP34-1 FAIL: anon should read 6 reaction kinds';
  end if;
  -- fan reacts to the owner's check-in: sees only "mine"
  perform pg_temp.be('22222222-2222-2222-2222-222222222234', 'fan@tp34.local');
  r := public.react('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', 'fire');
  if r->>'mine' <> 'fire' or r ? 'tally' then
    raise exception 'TP34-1 FAIL: follower reaction wrong (must have mine, no tally): %', r;
  end if;
  r := public.react('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', 'heart');
  if r->>'mine' <> 'heart' then raise exception 'TP34-1 FAIL: second react did not replace: %', r; end if;
  begin
    perform public.react('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', 'thumbs');
    raise exception 'TP34-1 FAIL: unknown kind accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.react('eeeeeeee-eeee-eeee-eeee-eeeeeeeee341', 'heart');
    raise exception 'TP34-1 FAIL: follower reacted to a private note';
  exception when insufficient_privilege then null; end;
  -- aunt follows only the partner: can react to the partner's post, not the owner's
  perform pg_temp.be('77777777-7777-7777-7777-777777777734', 'aunt@tp34.local');
  perform public.react('eeeeeeee-eeee-eeee-eeee-eeeeeeeee343', 'care');
  begin
    perform public.react('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', 'care');
    raise exception 'TP34-1 FAIL: aunt reacted to a post by someone she does not follow';
  exception when insufficient_privilege then null; end;
  -- a stranger is refused, and sees nothing through feed_social
  perform pg_temp.be('44444444-4444-4444-4444-444444444434', 'nosy@tp34.local');
  begin
    perform public.react('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', 'heart');
    raise exception 'TP34-1 FAIL: stranger reacted';
  exception when insufficient_privilege then null; end;
  if public.feed_social(array['eeeeeeee-eeee-eeee-eeee-eeeeeeeee342']::uuid[]) <> '[]'::jsonb then
    raise exception 'TP34-1 FAIL: stranger got feed_social rows';
  end if;
  -- the partner (a traveller) reacts too, and sees the tally and the reactors
  perform pg_temp.be('55555555-5555-5555-5555-555555555534', 'partner@tp34.local');
  perform public.react('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', 'heart');
  s := public.feed_social(array['eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee341']::uuid[]);
  if jsonb_array_length(s) <> 2 then raise exception 'TP34-1 FAIL: traveller should see both posts: %', s; end if;
  r := (select x from jsonb_array_elements(s) x where x->>'event_id' = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee342');
  if r->>'mine' <> 'heart' or r->'tally'->0->>'kind' <> 'heart' or (r->'tally'->0->>'count')::int <> 2 then
    raise exception 'TP34-1 FAIL: traveller tally wrong: %', r;
  end if;
  if jsonb_array_length(public.event_reactors('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342')) <> 2
     or not (public.event_reactors('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342') @> '[{"name":"Fan","kind":"heart"}]'::jsonb) then
    raise exception 'TP34-1 FAIL: reactors wrong: %', public.event_reactors('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342');
  end if;
  -- a follower gets nothing from event_reactors
  perform pg_temp.be('22222222-2222-2222-2222-222222222234', 'fan@tp34.local');
  if public.event_reactors('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342') <> '[]'::jsonb then
    raise exception 'TP34-1 FAIL: follower saw reactors';
  end if;
  -- null clears
  r := public.react('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', null);
  if r ? 'mine' then raise exception 'TP34-1 FAIL: null did not clear: %', r; end if;
  -- no direct table access for anyone
  if (select count(*) from public.event_reactions) <> 0 then
    raise exception 'TP34-1 FAIL: event_reactions readable directly';
  end if;
  perform pg_temp.god();
  raise notice 'TP34-1 ok';
end $$;

-- ---- 2) comments -------------------------------------------------------------
do $$
declare c jsonb; t jsonb; top uuid; rep uuid; tok text;
begin
  tok := (select v from tp34 where k = 'token');
  perform pg_temp.be('22222222-2222-2222-2222-222222222234', 'fan@tp34.local');
  c := public.add_comment('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', '  Did you go up to the summit?  ', null);
  top := (c->>'id')::uuid;
  if c->>'body' <> 'Did you go up to the summit?' or c->>'authorName' <> 'Fan' or (c->>'isTraveller')::boolean then
    raise exception 'TP34-2 FAIL: comment row wrong: %', c;
  end if;
  begin
    perform public.add_comment('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', '   ', null);
    raise exception 'TP34-2 FAIL: empty comment accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.add_comment('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', repeat('x', 2001), null);
    raise exception 'TP34-2 FAIL: oversized comment accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.add_comment('eeeeeeee-eeee-eeee-eeee-eeeeeeeee341', 'peek', null);
    raise exception 'TP34-2 FAIL: follower commented on a private note';
  exception when insufficient_privilege then null; end;
  -- the owner replies, marked as traveller
  perform pg_temp.be('11111111-1111-1111-1111-111111111134', 'owner@tp34.local');
  c := public.add_comment('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', 'Halfway, then ramen won.', top);
  rep := (c->>'id')::uuid;
  if (c->>'parent_id')::uuid <> top or not (c->>'isTraveller')::boolean or c->>'authorName' <> 'Patrik' then
    raise exception 'TP34-2 FAIL: reply row wrong: %', c;
  end if;
  begin
    perform public.add_comment('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', 'too deep', rep);
    raise exception 'TP34-2 FAIL: reply to a reply accepted';
  exception when invalid_parameter_value then null; end;
  -- order: parent, then its reply; same thread for follower, traveller and anon
  t := public.event_comments_list('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342');
  if jsonb_array_length(t) <> 2 or (t->0->>'id')::uuid <> top or (t->1->>'id')::uuid <> rep then
    raise exception 'TP34-2 FAIL: thread order wrong: %', t;
  end if;
  perform pg_temp.be('22222222-2222-2222-2222-222222222234', 'fan@tp34.local');
  if public.event_comments_list('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342') <> t then
    raise exception 'TP34-2 FAIL: follower sees a different thread';
  end if;
  if public.event_comments_list('eeeeeeee-eeee-eeee-eeee-eeeeeeeee341') is not null then
    raise exception 'TP34-2 FAIL: follower read a private thread';
  end if;
  perform pg_temp.anon();
  if public.shared_event_comments(tok, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee342') <> t then
    raise exception 'TP34-2 FAIL: anon sees a different thread';
  end if;
  if public.shared_event_comments(tok, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee341') is not null
     or public.shared_event_comments('bad-token', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee342') is not null then
    raise exception 'TP34-2 FAIL: anon read what it should not';
  end if;
  if (public.shared_feed_social(tok, array['eeeeeeee-eeee-eeee-eeee-eeeeeeeee342']::uuid[])->0->>'commentCount')::int <> 2 then
    raise exception 'TP34-2 FAIL: anon comment count wrong';
  end if;
  -- the aunt (follows only the partner) cannot read the owner's post thread
  perform pg_temp.be('77777777-7777-7777-7777-777777777734', 'aunt@tp34.local');
  if public.event_comments_list('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342') is not null then
    raise exception 'TP34-2 FAIL: aunt read a thread on a post she cannot see';
  end if;
  -- deletion: a bystander cannot; the author can; the deleted parent stays as a placeholder
  perform pg_temp.be('44444444-4444-4444-4444-444444444434', 'nosy@tp34.local');
  begin
    perform public.delete_comment(top);
    raise exception 'TP34-2 FAIL: bystander deleted a comment';
  exception when insufficient_privilege then null; end;
  perform pg_temp.be('22222222-2222-2222-2222-222222222234', 'fan@tp34.local');
  perform public.delete_comment(top);
  t := public.event_comments_list('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342');
  if jsonb_array_length(t) <> 2 or not (t->0->>'deleted')::boolean or t->0->>'body' <> ''
     or (t->0->>'authorName') is not null or (t->1->>'deleted')::boolean then
    raise exception 'TP34-2 FAIL: placeholder semantics wrong: %', t;
  end if;
  if (public.feed_social(array['eeeeeeee-eeee-eeee-eeee-eeeeeeeee342']::uuid[])->0->>'commentCount')::int <> 1 then
    raise exception 'TP34-2 FAIL: count should exclude the deleted comment';
  end if;
  -- a traveller moderates the reply away → the whole thread vanishes
  perform pg_temp.be('55555555-5555-5555-5555-555555555534', 'partner@tp34.local');
  perform public.delete_comment(rep);
  if public.event_comments_list('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342') <> '[]'::jsonb then
    raise exception 'TP34-2 FAIL: thread should be empty after both deletions: %',
      public.event_comments_list('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342');
  end if;
  perform pg_temp.god();
  raise notice 'TP34-2 ok';
end $$;

-- ---- 3) reports ---------------------------------------------------------------
do $$
declare cid uuid; n int;
begin
  perform pg_temp.be('22222222-2222-2222-2222-222222222234', 'fan@tp34.local');
  cid := (public.add_comment('eeeeeeee-eeee-eeee-eeee-eeeeeeeee342', 'something rude', null)->>'id')::uuid;
  perform pg_temp.be('55555555-5555-5555-5555-555555555534', 'partner@tp34.local');
  perform public.report_comment(cid, 'rude');
  perform public.report_comment(cid, 'still rude');   -- same reporter: updates, no second row
  select count(*) into n from public.comment_reports;
  if n <> 0 then raise exception 'TP34-3 FAIL: non-admin read comment_reports'; end if;
  perform pg_temp.be('44444444-4444-4444-4444-444444444434', 'nosy@tp34.local');
  begin
    perform public.report_comment(cid, 'cannot even see it');
    raise exception 'TP34-3 FAIL: stranger reported a comment they cannot see';
  exception when insufficient_privilege then null; end;
  perform pg_temp.be('88888888-8888-8888-8888-888888888834', 'admin@tp34.local');
  select count(*) into n from public.comment_reports where comment_id = cid;
  if n <> 1 then raise exception 'TP34-3 FAIL: admin should see exactly 1 report, saw %', n; end if;
  perform pg_temp.god();
  raise notice 'TP34-3 ok';
end $$;

-- ---- 4) followers, remove, block ---------------------------------------------
do $$
declare l jsonb; r jsonb; n int;
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111134', 'owner@tp34.local');
  l := public.my_followers();
  if jsonb_array_length(l) <> 1 or l->0->>'name' <> 'Fan' then
    raise exception 'TP34-4 FAIL: owner followers wrong: %', l;
  end if;
  -- the fan's own trip is OFF → no location shown to the owner
  if (l->0->'location') is not null and (l->0->'location') <> 'null'::jsonb then
    raise exception 'TP34-4 FAIL: location leaked from a closed trip: %', l;
  end if;
  perform pg_temp.god();
  update public.trips set follower_access = 'on' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb34';
  perform pg_temp.be('11111111-1111-1111-1111-111111111134', 'owner@tp34.local');
  l := public.my_followers();
  if l->0->'location'->>'city' <> 'Lisbon' or l->0->'location'->>'country' <> 'Portugal' then
    raise exception 'TP34-4 FAIL: location missing from an open trip: %', l;
  end if;
  -- the partner has two followers (fan, aunt)
  perform pg_temp.be('55555555-5555-5555-5555-555555555534', 'partner@tp34.local');
  if jsonb_array_length(public.my_followers()) <> 2 then
    raise exception 'TP34-4 FAIL: partner should have 2 followers';
  end if;
  -- remove: the partner deletes the aunt's follow by plain delete
  delete from public.user_follows where follower_id = '77777777-7777-7777-7777-777777777734';
  if jsonb_array_length(public.my_followers()) <> 1 then
    raise exception 'TP34-4 FAIL: remove follower did not work';
  end if;
  -- block: the owner blocks the fan → follow gone, door shut, listed, unblock reopens
  perform pg_temp.be('11111111-1111-1111-1111-111111111134', 'owner@tp34.local');
  perform public.block_user('22222222-2222-2222-2222-222222222234');
  if public.my_followers() <> '[]'::jsonb then raise exception 'TP34-4 FAIL: block left the follow'; end if;
  if public.my_blocked()->0->>'name' <> 'Fan' then raise exception 'TP34-4 FAIL: my_blocked wrong: %', public.my_blocked(); end if;
  begin
    perform public.block_user('11111111-1111-1111-1111-111111111134');
    raise exception 'TP34-4 FAIL: self-block accepted';
  exception when invalid_parameter_value then null; end;
  perform pg_temp.be('22222222-2222-2222-2222-222222222234', 'fan@tp34.local');
  r := public.follow_by_token((select v from tp34 where k = 'token'),
                              array['11111111-1111-1111-1111-111111111134']::uuid[]);
  if r is not null then raise exception 'TP34-4 FAIL: blocked fan re-followed the owner'; end if;
  perform pg_temp.be('11111111-1111-1111-1111-111111111134', 'owner@tp34.local');
  perform public.unblock_user('22222222-2222-2222-2222-222222222234');
  perform pg_temp.be('22222222-2222-2222-2222-222222222234', 'fan@tp34.local');
  r := public.follow_by_token((select v from tp34 where k = 'token'),
                              array['11111111-1111-1111-1111-111111111134']::uuid[]);
  if r is null then raise exception 'TP34-4 FAIL: unblock did not reopen the door'; end if;
  -- a follower cannot see who else follows someone
  select count(*) into n from public.user_follows where followee_id = '11111111-1111-1111-1111-111111111134'
                                                    and follower_id <> auth.uid();
  if n <> 0 then raise exception 'TP34-4 FAIL: follower sees other followers'; end if;
  perform pg_temp.god();
  raise notice 'TP34-4 ok';
end $$;

-- ---- 5) my_following carries the country ------------------------------------
do $$
declare l jsonb;
begin
  perform pg_temp.be('22222222-2222-2222-2222-222222222234', 'fan@tp34.local');
  l := public.my_following();
  if jsonb_array_length(l) <> 2 then raise exception 'TP34-5 FAIL: fan should follow 2 people: %', l; end if;
  if l->0->'trips'->0->>'currentCity' <> 'Bangkok' or l->0->'trips'->0->>'currentCountry' <> 'Thailand' then
    raise exception 'TP34-5 FAIL: currentCountry missing: %', l->0;
  end if;
  perform pg_temp.god();
  raise notice 'TP34-5 ok';
end $$;

-- ---- 6) grants and the load-bearing rule -----------------------------------
do $$
declare bad text;
begin
  select string_agg(schemaname || '.' || tablename || ':' || policyname, ', ') into bad
  from pg_policies
  where coalesce(qual, '') ilike '%can_follow_trip%' or coalesce(with_check, '') ilike '%can_follow_trip%'
     or coalesce(qual, '') ilike '%_can_see_event%' or coalesce(with_check, '') ilike '%_can_see_event%';
  if bad is not null then
    raise exception 'TP34-6 FAIL: a follower predicate is used in RLS: %', bad;
  end if;
  select string_agg(tablename || ':' || policyname, ', ') into bad
  from pg_policies where tablename in ('event_reactions', 'event_comments');
  if bad is not null then
    raise exception 'TP34-6 FAIL: interaction tables must have no policies: %', bad;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.event_reactions'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.event_comments'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.comment_reports'::regclass) then
    raise exception 'TP34-6 FAIL: RLS off on an interaction table';
  end if;
  if has_function_privilege('anon', 'public.react(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.feed_social(uuid[])', 'execute')
     or has_function_privilege('anon', 'public.event_reactors(uuid)', 'execute')
     or has_function_privilege('anon', 'public.event_comments_list(uuid)', 'execute')
     or has_function_privilege('anon', 'public.add_comment(uuid, text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.delete_comment(uuid)', 'execute')
     or has_function_privilege('anon', 'public.report_comment(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.my_followers()', 'execute')
     or has_function_privilege('anon', 'public.block_user(uuid)', 'execute')
     or has_function_privilege('anon', 'public.unblock_user(uuid)', 'execute')
     or has_function_privilege('anon', 'public.my_blocked()', 'execute') then
    raise exception 'TP34-6 FAIL: an account-only function is callable by anon';
  end if;
  if has_function_privilege('authenticated', 'public._can_see_event(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._token_can_see_event(text, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._comments_core(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._open_location(uuid)', 'execute') then
    raise exception 'TP34-6 FAIL: an internal helper is callable by an end-user role';
  end if;
  if not has_function_privilege('anon', 'public.shared_event_comments(text, uuid)', 'execute')
     or not has_function_privilege('anon', 'public.shared_feed_social(text, uuid[])', 'execute') then
    raise exception 'TP34-6 FAIL: anon lost a shared_* grant';
  end if;
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and p.proname in ('_can_see_event','_token_can_see_event','_open_location','my_followers','block_user',
                      'unblock_user','my_blocked','my_following','react','feed_social','event_reactors',
                      'shared_feed_social','_comments_core','event_comments_list','shared_event_comments',
                      'add_comment','delete_comment','report_comment')
    and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
  if bad is not null then
    raise exception 'TP34-6 FAIL: search_path not pinned on: %', bad;
  end if;
  raise notice 'TP34-6 ok';
end $$;

rollback;
