-- ============================================================================
-- 29-TESTPLAN.sql — assertions for the privacy hardening migration.
--
-- Run against STAGING after applying 29-privacy-hardening.sql. Every block
-- raises on failure; a clean run means every assertion held. Rolls itself back.
--
-- What must hold:
--   1. A stranger cannot read another user's places, and cannot even filter on
--      created_by to find them. Catalogue rows stay world-readable.
--   2. A co-traveller DOES still see a place their partner created, because the
--      check-in that created it is on a trip they can view (this is what keeps
--      the /live picker working — the regression to watch for).
--   3. Two different users can each add the same place name in the same city
--      (per-creator uniqueness), which the old global constraint refused.
--   4. A user cannot promote their own place into the curated catalogue.
--   5. unsubscribe_push needs a LIVE share token; the endpoint alone is not
--      enough, and the 1-argument version is gone.
--   6. delete_my_account clears the caller's email from alert_log and
--      digest_subscriptions, and leaves other people's invites alone when the
--      caller's address is unverified.
--   7. anon/authenticated have no privileges on schema net.
-- ============================================================================

begin;

-- ---- fixtures -------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at)
values ('11111111-1111-1111-1111-111111111129', 'owner@tp29.local',   now()),
       ('22222222-2222-2222-2222-222222222229', 'partner@tp29.local', now()),
       ('33333333-3333-3333-3333-333333333329', 'nosy@tp29.local',    now()),
       ('44444444-4444-4444-4444-444444444429', 'ghost@tp29.local',   null)
on conflict (id) do nothing;

insert into public.profiles (id) values
  ('11111111-1111-1111-1111-111111111129'),
  ('22222222-2222-2222-2222-222222222229'),
  ('33333333-3333-3333-3333-333333333329'),
  ('44444444-4444-4444-4444-444444444429')
on conflict (id) do nothing;

insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa29',
        '11111111-1111-1111-1111-111111111129', 'TP29 Trip',
        '{"meta":{"tripName":"TP29 Trip"}}'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;

-- partner is an editor on the owner's trip; nosy is on nothing.
insert into public.trip_members (trip_id, user_id, role)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa29',
        '22222222-2222-2222-2222-222222222229', 'editor')
on conflict (trip_id, user_id) do update set role = excluded.role;

-- Same role discipline as 25-28: the migration session bypasses RLS, so every
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

-- A catalogue place and a private one created by the owner, plus the check-in
-- that ties the private one to the trip (exactly what CheckInModal does).
-- cities.id is GENERATED ALWAYS — the fixture needs a known id for the FK
-- below, so override the identity rather than drop the explicit value
insert into public.cities (id, region, country, city)
overriding system value
values (929929, 'TP29', 'Testland', 'TP29 City')
on conflict (id) do nothing;

insert into public.places (id, city_id, name, kind, source, created_by)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb29', 929929, 'TP29 Catalogue Landmark',
        'landmark', 'catalogue', null),
       ('cccccccc-cccc-cccc-cccc-cccccccccc29', 929929, 'Our Apartment',
        'other', 'user', '11111111-1111-1111-1111-111111111129')
on conflict (id) do nothing;

insert into public.trip_events (id, trip_id, author, kind, visibility)
values ('dddddddd-dddd-dddd-dddd-dddddddddd29', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa29',
        '11111111-1111-1111-1111-111111111129', 'checkin', 'trip')
on conflict (id) do nothing;

insert into public.check_ins (event_id, trip_id, place_id, rating)
values ('dddddddd-dddd-dddd-dddd-dddddddddd29', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa29',
        'cccccccc-cccc-cccc-cccc-cccccccccc29', 5)
on conflict (event_id) do nothing;


-- ---- 1) a stranger sees the catalogue row and NOT the private one ---------
do $$
declare v_private int; v_catalogue int;
begin
  perform pg_temp.be('33333333-3333-3333-3333-333333333329', 'nosy@tp29.local');
  select count(*) into v_private from public.places
   where id = 'cccccccc-cccc-cccc-cccc-cccccccccc29';
  select count(*) into v_catalogue from public.places
   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb29';
  if v_private <> 0 then
    raise exception 'TP29-1 FAIL: a stranger can read another user''s place';
  end if;
  if v_catalogue <> 1 then
    raise exception 'TP29-1 FAIL: the shared catalogue stopped being readable';
  end if;
end $$;

-- The attribution query the review was actually about: filtering by created_by
-- must not surface anything, whatever the attacker already knows.
do $$
declare v_n int;
begin
  perform pg_temp.be('33333333-3333-3333-3333-333333333329', 'nosy@tp29.local');
  select count(*) into v_n from public.places
   where created_by = '11111111-1111-1111-1111-111111111129';
  if v_n <> 0 then
    raise exception 'TP29-1 FAIL: created_by still reconstructs a user''s itinerary (% rows)', v_n;
  end if;
end $$;

-- ---- 2) the co-traveller still sees it (picker must not regress) ----------
do $$
declare v_n int;
begin
  perform pg_temp.be('22222222-2222-2222-2222-222222222229', 'partner@tp29.local');
  select count(*) into v_n from public.places
   where id = 'cccccccc-cccc-cccc-cccc-cccccccccc29';
  if v_n <> 1 then
    raise exception 'TP29-2 FAIL: a co-traveller lost sight of a shared trip''s place';
  end if;
end $$;

-- ---- 3) same name, same city, two different creators ---------------------
do $$
begin
  perform pg_temp.be('33333333-3333-3333-3333-333333333329', 'nosy@tp29.local');
  -- The old global unique (city_id, name) refused this with 23505 against a row
  -- the caller cannot even see — a dead end in the check-in flow.
  insert into public.places (city_id, city_name, name, kind, source, created_by)
  values (929929, 'TP29 City', 'Our Apartment', 'other', 'user',
          '33333333-3333-3333-3333-333333333329');
exception when unique_violation then
  raise exception 'TP29-3 FAIL: user places are still globally unique by name';
end $$;

-- ...but a creator still cannot duplicate their OWN place in the same city.
do $$
begin
  perform pg_temp.be('33333333-3333-3333-3333-333333333329', 'nosy@tp29.local');
  begin
    insert into public.places (city_id, city_name, name, kind, source, created_by)
    values (929929, 'TP29 City', 'Our Apartment', 'other', 'user',
            '33333333-3333-3333-3333-333333333329');
    raise exception 'TP29-3 FAIL: per-creator uniqueness is not enforced';
  exception when unique_violation then
    null; -- expected
  end;
end $$;

-- ---- 4) no laundering a user place into the catalogue --------------------
do $$
declare v_source text;
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111129', 'owner@tp29.local');
  begin
    update public.places set source = 'catalogue'
     where id = 'cccccccc-cccc-cccc-cccc-cccccccccc29';
  exception when insufficient_privilege then
    null; -- RLS refusal is also an acceptable outcome
  end;
  perform pg_temp.god();
  select source into v_source from public.places
   where id = 'cccccccc-cccc-cccc-cccc-cccccccccc29';
  if v_source <> 'user' then
    raise exception 'TP29-4 FAIL: a user promoted their own place to catalogue';
  end if;
end $$;

-- ---- 5) unsubscribe_push is bound to a live share ------------------------
do $$
declare v_token text; v_share uuid; v_left int;
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111129', 'owner@tp29.local');
  v_token := public.create_share_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa29', 'TP29', null);

  perform pg_temp.god();
  select id into v_share from public.trip_shares
   where token_hash = encode(sha256(v_token::bytea), 'hex');
  insert into public.push_subscriptions (share_id, endpoint, p256dh, auth)
  values (v_share, 'https://push.example/tp29', 'k', 'a')
  on conflict (endpoint) do nothing;

  -- The 1-arg version must be gone entirely, not merely unused.
  if to_regprocedure('public.unsubscribe_push(text)') is not null then
    raise exception 'TP29-5 FAIL: unsubscribe_push(text) still exists — endpoint alone still deletes';
  end if;

  -- A wrong token must not delete anything.
  perform pg_temp.anon();
  begin
    perform public.unsubscribe_push('not-a-real-token', 'https://push.example/tp29');
  exception when insufficient_privilege then
    null; -- expected: 'invalid link'
  end;
  perform pg_temp.god();
  select count(*) into v_left from public.push_subscriptions
   where endpoint = 'https://push.example/tp29';
  if v_left <> 1 then
    raise exception 'TP29-5 FAIL: a bogus token unsubscribed a follower';
  end if;

  -- The real token works.
  perform pg_temp.anon();
  perform public.unsubscribe_push(v_token, 'https://push.example/tp29');
  perform pg_temp.god();
  select count(*) into v_left from public.push_subscriptions
   where endpoint = 'https://push.example/tp29';
  if v_left <> 0 then
    raise exception 'TP29-5 FAIL: the rightful holder could not unsubscribe';
  end if;
end $$;

-- ---- 6) account deletion is complete, and does not trust an unverified email
do $$
declare v_share uuid; v_alerts int; v_digests int; v_invites int;
begin
  perform pg_temp.god();
  select id into v_share from public.trip_shares
   where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa29' limit 1;

  -- personal data hanging off OTHER people's trips
  insert into public.alert_log (trip_id, item_id, kind, sent_to)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa29', 'stay-1', 'cancel-7', 'partner@tp29.local')
  on conflict do nothing;
  insert into public.digest_subscriptions (share_id, email, confirm_token_hash, unsub_token, confirmed_at)
  values (v_share, 'partner@tp29.local', 'h', 'u29', now())
  on conflict (share_id, email) do nothing;

  -- an invite addressed to partner, which the UNVERIFIED ghost must not destroy
  insert into public.trip_invites (trip_id, email, role, invited_by, status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa29', 'partner@tp29.local', 'viewer',
          '11111111-1111-1111-1111-111111111129', 'pending');

  -- ghost@ is unconfirmed; claiming partner's address must change nothing.
  perform pg_temp.be('44444444-4444-4444-4444-444444444429', 'partner@tp29.local');
  perform public.delete_my_account();
  perform pg_temp.god();
  select count(*) into v_invites from public.trip_invites
   where lower(email) = 'partner@tp29.local' and status = 'pending';
  if v_invites <> 1 then
    raise exception 'TP29-6 FAIL: an unverified account deleted someone else''s invite';
  end if;

  -- partner deletes their own account: their email must not survive anywhere.
  perform pg_temp.be('22222222-2222-2222-2222-222222222229', 'partner@tp29.local');
  perform public.delete_my_account();
  perform pg_temp.god();
  select count(*) into v_alerts from public.alert_log
   where lower(sent_to) = 'partner@tp29.local';
  select count(*) into v_digests from public.digest_subscriptions
   where lower(email) = 'partner@tp29.local';
  if v_alerts <> 0 then
    raise exception 'TP29-6 FAIL: alert_log still holds the deleted user''s email';
  end if;
  if v_digests <> 0 then
    raise exception 'TP29-6 FAIL: digest_subscriptions still holds the deleted user''s email';
  end if;
end $$;

-- ---- 7) schema net is closed to the client roles -------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'net') then
    if has_schema_privilege('authenticated', 'net', 'usage')
       or has_schema_privilege('anon', 'net', 'usage') then
      raise exception 'TP29-7 FAIL: client roles still reach schema net (SSRF + cron secret)';
    end if;
  end if;
end $$;

rollback;
-- ============================================================================
-- A clean run prints no NOTICE and ends with ROLLBACK. Any FAIL above aborts.
-- ============================================================================
