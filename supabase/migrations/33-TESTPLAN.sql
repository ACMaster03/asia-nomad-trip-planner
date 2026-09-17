-- ============================================================================
-- 33-TESTPLAN.sql — assertions for social following (Phase A, person model).
--
-- Run against STAGING after applying 33-social-following.sql. Every block
-- raises on failure; a clean run means every assertion held. Rolls itself back.
--
-- What must hold:
--   1. Through a live link a signed-in user follows every traveller by default
--      (owner + editors, never the viewer, never themselves); a chosen subset
--      works; re-following is idempotent; my_following() lists people with
--      their visible trips. Names are first names, never the email prefix.
--   2. Dead, expired and paused links get null. A person who blocked the
--      caller (by id, or by the caller's real email) is skipped silently; when
--      nobody is left, null.
--   3. A follower reads nothing private: zero rows from trips, trip_events,
--      ledger, trip_shares; never a 'trip'-visibility event; check-ins and
--      notes only from the travellers they follow; 'arrived' from the trip.
--   4. follower_access: 'paused' → summary paused, feed empty, list dark;
--      'off' → trip gone from the list, summary null, feed empty;
--      set_trip_sharing_paused flips on ↔ paused and leaves 'off' alone.
--      The follow itself survives all of it.
--   5. RLS: a follower sees only rows on their own ends, cannot insert, can
--      unfollow by delete; the followee sees who follows them; nobody sees
--      another person's blocks.
--   6. The anonymous projection equals the follower projection: shared_feed
--      rows = following_feed rows minus trip_id/tripName for someone who
--      follows every traveller; summary equal minus broadcastTopic/following.
--   7. Grants: anon can call none of the new functions; can_follow_trip is
--      callable by no end-user role and appears in no RLS policy; every new
--      definer function pins search_path.
-- ============================================================================

begin;

-- ---- fixtures ---------------------------------------------------------------
-- owner (1111) + partner (5555, editor) travel; viewer (6666) only reads.
-- fan (2222) follows both; aunt (7777) follows only the partner.
-- blocked (3333) is blocked by the owner by id; nosy (4444) by email.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111133', 'owner@tp33.local',   now(), '{"first_name":"Patrik"}'),
  ('55555555-5555-5555-5555-555555555533', 'partner@tp33.local', now(), '{}'),
  ('66666666-6666-6666-6666-666666666633', 'viewer@tp33.local',  now(), '{"first_name":"Viewer"}'),
  ('22222222-2222-2222-2222-222222222233', 'fan@tp33.local',     now(), '{"first_name":"Fan"}'),
  ('77777777-7777-7777-7777-777777777733', 'aunt@tp33.local',    now(), '{"first_name":"Aunt"}'),
  ('33333333-3333-3333-3333-333333333333', 'blocked@tp33.local', now(), '{"first_name":"Blocked"}'),
  ('44444444-4444-4444-4444-444444444433', 'nosy@tp33.local',    now(), '{"first_name":"Nosy"}')
on conflict (id) do nothing;
insert into public.profiles (id) values
  ('11111111-1111-1111-1111-111111111133'), ('55555555-5555-5555-5555-555555555533'),
  ('66666666-6666-6666-6666-666666666633'), ('22222222-2222-2222-2222-222222222233'),
  ('77777777-7777-7777-7777-777777777733'), ('33333333-3333-3333-3333-333333333333'),
  ('44444444-4444-4444-4444-444444444433')
on conflict (id) do nothing;

insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33',
        '11111111-1111-1111-1111-111111111133', 'TP33 Trip',
        '{"meta":{"tripName":"TP33 Trip","startDate":"2026-09-01","endDate":"2026-12-01"},
          "segments":[
            {"city":"Bangkok","country":"Thailand","arrive":"2026-09-01","depart":"2026-10-01"},
            {"city":"Hanoi","country":"Vietnam","arrive":"2026-10-01","depart":"2026-12-01"}]}'::jsonb,
        '[]'::jsonb)
on conflict (id) do nothing;
insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', '55555555-5555-5555-5555-555555555533', 'editor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', '66666666-6666-6666-6666-666666666633', 'viewer')
on conflict (trip_id, user_id) do update set role = excluded.role;

-- Four events: owner's private note, owner's follower check-in, partner's
-- follower check-in, owner's public arrival.
insert into public.trip_events (id, trip_id, author, kind, payload, visibility, occurred_at) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee331', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33',
   '11111111-1111-1111-1111-111111111133', 'note',
   '{"text":"PRIVATE: passport is in the grey bag"}', 'trip', now() - interval '4 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee332', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33',
   '11111111-1111-1111-1111-111111111133', 'checkin',
   '{"placeName":"Wat Pho","photos":["p/1.jpg"],"secret":"should not leak"}', 'followers', now() - interval '3 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33',
   '55555555-5555-5555-5555-555555555533', 'checkin',
   '{"placeName":"Mango sticky rice"}', 'followers', now() - interval '2 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee334', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33',
   '11111111-1111-1111-1111-111111111133', 'arrived',
   '{"city":"Bangkok"}', 'public', now() - interval '1 hour')
on conflict (id) do nothing;
insert into public.check_ins (event_id, trip_id, rating, comment) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee332', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', 5, 'go before 9'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', 4, null)
on conflict (event_id) do nothing;

-- Same role discipline as 25-31: the migration session bypasses RLS, so every
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

-- Links minted by the owner the real way; the fixture blocks read and add
-- tokens while SET ROLE authenticated.
create temp table tp33_tokens (label text primary key, token text);
grant select, insert on tp33_tokens to authenticated;
do $$
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111133', 'owner@tp33.local');
  insert into tp33_tokens values
    ('family',  public.create_share_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', 'family')),
    ('friends', public.create_share_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', 'friends')),
    ('dead',    public.create_share_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', 'dead')),
    ('expired', public.create_share_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', 'expired', now() - interval '1 day'));
  -- the trip was created after the backfill ran, so switch it on the way the app will
  perform public.set_follower_access('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', 'on');
  perform pg_temp.god();
  update public.trip_shares set revoked_at = now()
   where token_hash = encode(sha256((select token from tp33_tokens where label = 'dead')::bytea), 'hex');
  update public.trip_shares set paused_at = now()
   where token_hash = encode(sha256((select token from tp33_tokens where label = 'friends')::bytea), 'hex');
  -- Blocks written the Phase C way, by hand for now: the OWNER blocks two people.
  insert into public.user_blocks (blocker_id, blocked_id)
  values ('11111111-1111-1111-1111-111111111133', '33333333-3333-3333-3333-333333333333');
  insert into public.user_blocks (blocker_id, email)
  values ('11111111-1111-1111-1111-111111111133', 'NOSY@tp33.local');
end $$;

-- ---- 1) follow through a live link -----------------------------------------
do $$
declare r jsonb; l jsonb; tok text;
begin
  tok := (select token from tp33_tokens where label = 'family');
  perform pg_temp.be('22222222-2222-2222-2222-222222222233', 'fan@tp33.local');
  r := public.follow_by_token(tok, null);
  if r is null or r->>'trip_id' <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33' or r->>'tripName' <> 'TP33 Trip' then
    raise exception 'TP33-1 FAIL: follow_by_token did not return the trip: %', r;
  end if;
  if jsonb_array_length(r->'followed') <> 2 then
    raise exception 'TP33-1 FAIL: expected owner + editor, got %', r->'followed';
  end if;
  if r::text like '%Viewer%' then
    raise exception 'TP33-1 FAIL: the viewer is not a traveller: %', r;
  end if;
  -- names: first name, and "A traveller" for the partner who never set one —
  -- never "partner" (the email prefix that seeds profiles.display_name)
  if not (r->'followed' @> '[{"name":"Patrik"}]'::jsonb) or not (r->'followed' @> '[{"name":"A traveller"}]'::jsonb) then
    raise exception 'TP33-1 FAIL: names wrong: %', r->'followed';
  end if;
  if r::text ilike '%partner%' or r::text like '%@%' then
    raise exception 'TP33-1 FAIL: email or its prefix leaked: %', r;
  end if;
  -- idempotent
  perform public.follow_by_token(tok, null);
  if (select count(*) from public.user_follows where follower_id = auth.uid()) <> 2 then
    raise exception 'TP33-1 FAIL: re-follow changed the row count';
  end if;
  l := public.my_following();
  if jsonb_array_length(l) <> 2 then
    raise exception 'TP33-1 FAIL: my_following should list 2 people: %', l;
  end if;
  if l->0->>'name' <> 'A traveller' or l->1->>'name' <> 'Patrik' then
    raise exception 'TP33-1 FAIL: my_following order/names: %', l;
  end if;
  if jsonb_array_length(l->1->'trips') <> 1
     or l->1->'trips'->0->>'state' <> 'on'
     or l->1->'trips'->0->>'lastSeenCity' <> 'Bangkok'
     or (l->1->'trips'->0->>'lastEventAt') is null
     or jsonb_array_length(l->1->'trips'->0->'travellers') <> 2 then
    raise exception 'TP33-1 FAIL: trip summary in my_following wrong: %', l->1;
  end if;
  -- a chosen subset: the aunt follows only the partner
  perform pg_temp.be('77777777-7777-7777-7777-777777777733', 'aunt@tp33.local');
  r := public.follow_by_token(tok, array['55555555-5555-5555-5555-555555555533',
                                         '66666666-6666-6666-6666-666666666633']::uuid[]);
  if jsonb_array_length(r->'followed') <> 1 or r->'followed'->0->>'id' <> '55555555-5555-5555-5555-555555555533' then
    raise exception 'TP33-1 FAIL: subset follow wrong (viewer id must be ignored): %', r;
  end if;
  -- the owner walking through their own link follows the partner, never themselves
  perform pg_temp.be('11111111-1111-1111-1111-111111111133', 'owner@tp33.local');
  r := public.follow_by_token(tok, null);
  if jsonb_array_length(r->'followed') <> 1 or r->'followed'->0->>'id' <> '55555555-5555-5555-5555-555555555533' then
    raise exception 'TP33-1 FAIL: owner self-follow: %', r;
  end if;
  -- ...and their own trip is not in their following list (it is on Home already)
  if (public.my_following()->0->'trips') <> '[]'::jsonb then
    raise exception 'TP33-1 FAIL: own trip listed under a co-traveller: %', public.my_following();
  end if;
  delete from public.user_follows where follower_id = auth.uid();
  perform pg_temp.god();
  raise notice 'TP33-1 ok';
end $$;

-- ---- 2) doors that stay shut -----------------------------------------------
do $$
declare r jsonb;
begin
  perform pg_temp.be('44444444-4444-4444-4444-444444444433', 'nosy@tp33.local');
  if public.follow_by_token((select token from tp33_tokens where label = 'dead'), null) is not null then
    raise exception 'TP33-2 FAIL: revoked link followable';
  end if;
  if public.follow_by_token((select token from tp33_tokens where label = 'expired'), null) is not null then
    raise exception 'TP33-2 FAIL: expired link followable';
  end if;
  if public.follow_by_token((select token from tp33_tokens where label = 'friends'), null) is not null then
    raise exception 'TP33-2 FAIL: paused link followable';
  end if;
  if public.follow_by_token('not-a-token', null) is not null then
    raise exception 'TP33-2 FAIL: garbage token followable';
  end if;
  -- blocked by email by the owner (case-insensitive, real email from auth.users
  -- even though the JWT claims another): the partner did not block → follows
  -- the partner only, and the owner is skipped without a trace
  perform pg_temp.be('44444444-4444-4444-4444-444444444433', 'someone-else@tp33.local');
  r := public.follow_by_token((select token from tp33_tokens where label = 'family'), null);
  if r is null or jsonb_array_length(r->'followed') <> 1
     or r->'followed'->0->>'id' <> '55555555-5555-5555-5555-555555555533' then
    raise exception 'TP33-2 FAIL: email block not applied: %', r;
  end if;
  -- asking for the blocker alone: nothing left → null
  if public.follow_by_token((select token from tp33_tokens where label = 'family'),
                            array['11111111-1111-1111-1111-111111111133']::uuid[]) is not null then
    raise exception 'TP33-2 FAIL: email-blocked user followed the blocker';
  end if;
  perform pg_temp.be('33333333-3333-3333-3333-333333333333', 'blocked@tp33.local');
  if public.follow_by_token((select token from tp33_tokens where label = 'family'),
                            array['11111111-1111-1111-1111-111111111133']::uuid[]) is not null then
    raise exception 'TP33-2 FAIL: id-blocked user followed the blocker';
  end if;
  -- the blocked person following the partner sees the partner's posts, never the owner's
  r := public.follow_by_token((select token from tp33_tokens where label = 'family'), null);
  if jsonb_array_length(r->'followed') <> 1 then
    raise exception 'TP33-2 FAIL: id block not applied: %', r;
  end if;
  if public.following_feed(30, null)::text like '%Wat Pho%' then
    raise exception 'TP33-2 FAIL: blocked user sees the blocker''s check-in';
  end if;
  -- anon cannot even try
  perform pg_temp.anon();
  begin
    perform public.follow_by_token((select token from tp33_tokens where label = 'family'), null);
    raise exception 'TP33-2 FAIL: anon may call follow_by_token';
  exception
    when insufficient_privilege then null;
  end;
  perform pg_temp.god();
  raise notice 'TP33-2 ok';
end $$;

-- ---- 3) a follower reads nothing private, and only whom they follow --------
do $$
declare feed jsonb; s jsonb; n int;
begin
  perform pg_temp.be('22222222-2222-2222-2222-222222222233', 'fan@tp33.local');
  select count(*) into n from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33';
  if n <> 0 then raise exception 'TP33-3 FAIL: follower can read trips'; end if;
  select count(*) into n from public.trip_events where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33';
  if n <> 0 then raise exception 'TP33-3 FAIL: follower can read trip_events'; end if;
  select count(*) into n from public.check_ins where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33';
  if n <> 0 then raise exception 'TP33-3 FAIL: follower can read check_ins'; end if;
  select count(*) into n from public.ledger where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33';
  if n <> 0 then raise exception 'TP33-3 FAIL: follower can read ledger'; end if;
  select count(*) into n from public.trip_shares where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33';
  if n <> 0 then raise exception 'TP33-3 FAIL: follower can read trip_shares'; end if;
  select count(*) into n from public.trip_members where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33';
  if n <> 0 then raise exception 'TP33-3 FAIL: follower can read trip_members'; end if;

  -- the fan follows both travellers: 3 visible rows, the private note never
  feed := public.following_feed(30, null);
  if jsonb_array_length(feed) <> 3 then
    raise exception 'TP33-3 FAIL: expected 3 follower-visible rows, got %', feed;
  end if;
  if feed::text like '%PRIVATE%' or feed::text like '%should not leak%' or feed::text like '%@%' then
    raise exception 'TP33-3 FAIL: private content in following_feed: %', feed;
  end if;
  if feed->0->>'kind' <> 'arrived' or feed->0->>'authorName' <> 'Patrik'
     or feed->1->>'authorName' <> 'A traveller' or feed->1->>'rating' <> '4'
     or feed->2->'payload'->>'placeName' <> 'Wat Pho' or feed->2->>'comment' <> 'go before 9'
     or feed->0->>'trip_id' <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33' or feed->0->>'tripName' <> 'TP33 Trip' then
    raise exception 'TP33-3 FAIL: feed rows malformed: %', feed;
  end if;
  if jsonb_array_length(public.following_feed(30, (feed->0->>'occurred_at')::timestamptz)) <> 2 then
    raise exception 'TP33-3 FAIL: p_before ignored';
  end if;
  s := public.followed_trip_summary('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33');
  if s->>'tripName' <> 'TP33 Trip' or jsonb_array_length(s->'route') <> 2
     or jsonb_array_length(s->'travellers') <> 2 or jsonb_array_length(s->'following') <> 2
     or (s->>'broadcastTopic') is null then
    raise exception 'TP33-3 FAIL: followed_trip_summary wrong: %', s;
  end if;
  if s ? 'ledger' or s ? 'stays' or s ? 'transport' or s ? 'notes' or s::text like '%@%' then
    raise exception 'TP33-3 FAIL: summary widened: %', s;
  end if;

  -- the aunt follows only the partner: partner's check-in + the trip's arrival,
  -- but NOT the owner's check-in
  perform pg_temp.be('77777777-7777-7777-7777-777777777733', 'aunt@tp33.local');
  feed := public.following_feed(30, null);
  if jsonb_array_length(feed) <> 2 or feed::text like '%Wat Pho%'
     or feed->0->>'kind' <> 'arrived' or feed->1->'payload'->>'placeName' <> 'Mango sticky rice' then
    raise exception 'TP33-3 FAIL: author filter wrong for a partial follow: %', feed;
  end if;
  s := public.followed_trip_summary('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33');
  if jsonb_array_length(s->'following') <> 1 or s->'following'->>0 <> '55555555-5555-5555-5555-555555555533' then
    raise exception 'TP33-3 FAIL: summary.following wrong: %', s;
  end if;

  -- a non-follower gets null and an empty feed, not an error
  perform pg_temp.be('66666666-6666-6666-6666-666666666633', 'viewer@tp33.local');
  if public.following_feed(30, null) <> '[]'::jsonb then
    raise exception 'TP33-3 FAIL: non-follower got a feed';
  end if;
  perform pg_temp.be('44444444-4444-4444-4444-444444444433', 'nosy@tp33.local');
  delete from public.user_follows where follower_id = auth.uid();
  if public.followed_trip_summary('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33') is not null then
    raise exception 'TP33-3 FAIL: non-follower got a summary';
  end if;
  perform pg_temp.god();
  raise notice 'TP33-3 ok';
end $$;

-- ---- 4) follower_access states ---------------------------------------------
do $$
declare s jsonb; l jsonb; a text;
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111133', 'owner@tp33.local');
  perform public.set_follower_access('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', 'paused');
  perform pg_temp.be('22222222-2222-2222-2222-222222222233', 'fan@tp33.local');
  s := public.followed_trip_summary('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33');
  if not (s->>'paused')::boolean or s->>'tripName' <> 'TP33 Trip' or s ? 'route' or s ? 'travellers' then
    raise exception 'TP33-4 FAIL: paused not honoured: %', s;
  end if;
  if public.following_feed(30, null) <> '[]'::jsonb then
    raise exception 'TP33-4 FAIL: feed flowing while paused';
  end if;
  l := public.my_following();
  if l->1->'trips'->0->>'state' <> 'paused'
     or (l->1->'trips'->0->>'lastSeenCity') is not null
     or (l->1->'trips'->0->>'currentCity') is not null then
    raise exception 'TP33-4 FAIL: list not dark while paused: %', l;
  end if;
  -- off: the trip disappears from the list, the summary is null
  perform pg_temp.be('11111111-1111-1111-1111-111111111133', 'owner@tp33.local');
  perform public.set_follower_access('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', 'off');
  perform pg_temp.be('22222222-2222-2222-2222-222222222233', 'fan@tp33.local');
  if public.followed_trip_summary('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33') is not null then
    raise exception 'TP33-4 FAIL: summary readable while off';
  end if;
  if public.following_feed(30, null) <> '[]'::jsonb then
    raise exception 'TP33-4 FAIL: feed flowing while off';
  end if;
  l := public.my_following();
  if jsonb_array_length(l) <> 2 or l->1->'trips' <> '[]'::jsonb then
    raise exception 'TP33-4 FAIL: off trip still listed (people must stay): %', l;
  end if;
  -- the owner's pause-all switch leaves 'off' alone…
  perform pg_temp.be('11111111-1111-1111-1111-111111111133', 'owner@tp33.local');
  perform public.set_trip_sharing_paused('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', true);
  perform pg_temp.god();
  select follower_access into a from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33';
  if a <> 'off' then raise exception 'TP33-4 FAIL: pause-all touched off: %', a; end if;
  -- …and flips on ↔ paused
  perform pg_temp.be('11111111-1111-1111-1111-111111111133', 'owner@tp33.local');
  perform public.set_trip_sharing_paused('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', false);
  perform public.set_follower_access('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', 'on');
  perform public.set_trip_sharing_paused('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', true);
  perform pg_temp.god();
  select follower_access into a from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33';
  if a <> 'paused' then raise exception 'TP33-4 FAIL: pause-all did not pause followers: %', a; end if;
  perform pg_temp.be('11111111-1111-1111-1111-111111111133', 'owner@tp33.local');
  perform public.set_trip_sharing_paused('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', false);
  perform pg_temp.god();
  select follower_access into a from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33';
  if a <> 'on' then raise exception 'TP33-4 FAIL: resume did not restore on: %', a; end if;
  -- invalid value refused; a follower cannot flip the switch
  perform pg_temp.be('11111111-1111-1111-1111-111111111133', 'owner@tp33.local');
  begin
    perform public.set_follower_access('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', 'public');
    raise exception 'TP33-4 FAIL: invalid access value accepted';
  exception
    when invalid_parameter_value then null;
  end;
  perform pg_temp.be('22222222-2222-2222-2222-222222222233', 'fan@tp33.local');
  begin
    perform public.set_follower_access('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33', 'off');
    raise exception 'TP33-4 FAIL: follower may flip follower_access';
  exception
    when insufficient_privilege then null;
  end;
  -- the follows survived everything
  if (select count(*) from public.user_follows where follower_id = auth.uid()) <> 2 then
    raise exception 'TP33-4 FAIL: state changes deleted follows';
  end if;
  perform pg_temp.god();
  raise notice 'TP33-4 ok';
end $$;

-- ---- 5) RLS on the tables ----------------------------------------------------
do $$
declare n int;
begin
  perform pg_temp.be('22222222-2222-2222-2222-222222222233', 'fan@tp33.local');
  -- own rows only: the fan sees their 2 follows, not the aunt's
  select count(*) into n from public.user_follows;
  if n <> 2 then raise exception 'TP33-5 FAIL: follower sees % follow rows', n; end if;
  begin
    insert into public.user_follows (follower_id, followee_id)
    values (auth.uid(), '66666666-6666-6666-6666-666666666633');
    raise exception 'TP33-5 FAIL: direct insert into user_follows allowed';
  exception
    when insufficient_privilege then null;
  end;
  select count(*) into n from public.user_blocks;
  if n <> 0 then raise exception 'TP33-5 FAIL: follower can read another person''s blocks'; end if;
  -- the followee sees who follows them, and the count
  perform pg_temp.be('11111111-1111-1111-1111-111111111133', 'owner@tp33.local');
  -- (the blocked person never got a row on the owner — the door skipped them)
  select count(*) into n from public.user_follows where followee_id = auth.uid();
  if n <> 1 then raise exception 'TP33-5 FAIL: owner should see 1 follower (fan), saw %', n; end if;
  if public.my_follower_count() <> 1 then
    raise exception 'TP33-5 FAIL: my_follower_count wrong, got %', public.my_follower_count();
  end if;
  -- the partner has fan + aunt + the blocked person (the block is the owner's, not the partner's)
  perform pg_temp.be('55555555-5555-5555-5555-555555555533', 'partner@tp33.local');
  if public.my_follower_count() <> 3 then
    raise exception 'TP33-5 FAIL: partner follower count should be 3, got %', public.my_follower_count();
  end if;
  perform pg_temp.be('11111111-1111-1111-1111-111111111133', 'owner@tp33.local');
  select count(*) into n from public.user_blocks;
  if n <> 2 then raise exception 'TP33-5 FAIL: owner should see their 2 blocks'; end if;
  -- unfollow = plain delete of own row
  perform pg_temp.be('77777777-7777-7777-7777-777777777733', 'aunt@tp33.local');
  delete from public.user_follows where followee_id = '55555555-5555-5555-5555-555555555533';
  if public.my_following() <> '[]'::jsonb then
    raise exception 'TP33-5 FAIL: unfollow did not remove the row';
  end if;
  if public.followed_trip_summary('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33') is not null then
    raise exception 'TP33-5 FAIL: summary readable after unfollow';
  end if;
  perform pg_temp.god();
  raise notice 'TP33-5 ok';
end $$;

-- ---- 6) the anonymous projection matches the follower projection -----------
do $$
declare anon_feed jsonb; auth_feed jsonb; stripped jsonb; anon_sum jsonb; auth_sum jsonb; tok text;
begin
  tok := (select token from tp33_tokens where label = 'family');
  perform pg_temp.anon();
  anon_feed := public.shared_feed(tok);
  anon_sum  := public.shared_trip_summary(tok);
  perform pg_temp.be('22222222-2222-2222-2222-222222222233', 'fan@tp33.local');
  auth_feed := public.following_feed(30, null);
  auth_sum  := public.followed_trip_summary('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33');
  perform pg_temp.god();
  select jsonb_agg(r - 'trip_id' - 'tripName') into stripped from jsonb_array_elements(auth_feed) r;
  if anon_feed <> stripped then
    raise exception 'TP33-6 FAIL: feed projections differ: anon=% auth=%', anon_feed, stripped;
  end if;
  if jsonb_array_length(anon_feed) <> 3 or anon_feed::text like '%PRIVATE%' or anon_feed::text like '%@%' then
    raise exception 'TP33-6 FAIL: anon feed wrong: %', anon_feed;
  end if;
  if (anon_sum - 'broadcastTopic') <> (auth_sum - 'broadcastTopic' - 'following') then
    raise exception 'TP33-6 FAIL: summary projections differ: anon=% auth=%', anon_sum, auth_sum;
  end if;
  if anon_sum->>'broadcastTopic' <> auth_sum->>'broadcastTopic' then
    raise exception 'TP33-6 FAIL: follower got a different broadcast topic than the live link';
  end if;
  -- the anonymous page now shows first names, and still nothing else about the people
  if not (anon_sum->'travellers' @> '[{"name":"Patrik"}]'::jsonb) or anon_sum::text ilike '%partner%' then
    raise exception 'TP33-6 FAIL: traveller names on the anon summary wrong: %', anon_sum;
  end if;
  raise notice 'TP33-6 ok';
end $$;

-- ---- 7) grants and the load-bearing rule -----------------------------------
do $$
declare bad text;
begin
  if has_function_privilege('anon', 'public.follow_by_token(text, uuid[])', 'execute')
     or has_function_privilege('anon', 'public.my_following()', 'execute')
     or has_function_privilege('anon', 'public.followed_trip_summary(uuid)', 'execute')
     or has_function_privilege('anon', 'public.following_feed(int, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.set_follower_access(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.my_follower_count()', 'execute') then
    raise exception 'TP33-7 FAIL: an account-only function is callable by anon';
  end if;
  if has_function_privilege('anon', 'public.can_follow_trip(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.can_follow_trip(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._trip_feed_core(uuid[], uuid[], timestamptz, int)', 'execute')
     or has_function_privilege('authenticated', 'public._trip_summary_core(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._traveller_name(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._trip_travellers(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._followed_travellers(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._my_followees()', 'execute') then
    raise exception 'TP33-7 FAIL: an internal helper is callable by an end-user role';
  end if;
  if not has_function_privilege('anon', 'public.shared_feed(text, timestamptz, int)', 'execute')
     or not has_function_privilege('anon', 'public.shared_trip_summary(text)', 'execute') then
    raise exception 'TP33-7 FAIL: the anonymous RPCs lost their anon grant';
  end if;
  select string_agg(schemaname || '.' || tablename || ':' || policyname, ', ') into bad
  from pg_policies
  where coalesce(qual, '') ilike '%can_follow_trip%'
     or coalesce(with_check, '') ilike '%can_follow_trip%';
  if bad is not null then
    raise exception 'TP33-7 FAIL: can_follow_trip is used in RLS — the privacy model is broken: %', bad;
  end if;
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and p.proname in ('can_follow_trip','_traveller_name','_trip_travellers','_followed_travellers',
                      '_my_followees','_trip_summary_core','_trip_feed_core','follow_by_token',
                      'my_following','followed_trip_summary','following_feed','set_follower_access',
                      'set_trip_sharing_paused','my_follower_count','shared_feed','shared_trip_summary')
    and (p.proconfig is null or not exists (
          select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
  if bad is not null then
    raise exception 'TP33-7 FAIL: search_path not pinned on: %', bad;
  end if;
  raise notice 'TP33-7 ok';
end $$;

rollback;
