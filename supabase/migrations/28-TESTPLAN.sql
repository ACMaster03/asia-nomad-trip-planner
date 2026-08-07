-- ============================================================================
-- 28-TESTPLAN.sql — assertions for the tokened invite link (frame 06b).
--
-- Run against STAGING after applying 28-invite-token.sql. Every block raises
-- on failure; a clean run means every assertion held. Rolls itself back.
--
-- What must hold:
--   1. Every invite row carries a token, including rows that predate 28.
--   2. ANON can preview a pending invite — and gets EXACTLY the four
--      sanitized fields, nothing from state/ledger.
--   3. A wrong token previews as null; so do revoked and accepted invites
--      (dead and guessed tokens are indistinguishable).
--   4. Anon cannot call accept_invite_by_token at all (grant revoked).
--   5. A signed-in user with the WRONG email cannot accept by token, and the
--      error does not differ from the unknown-token error.
--   6. The addressed user accepts by token and lands with the invited role.
--   7. Revisiting the token after acceptance returns the trip id again
--      (idempotent), for the accepter ONLY.
-- ============================================================================

begin;

-- ---- fixtures -------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111128', 'owner@tp28.local', '{"display_name":"Owner"}'),
       ('22222222-2222-2222-2222-222222222228', 'anna@tp28.local',  '{}'),
       ('33333333-3333-3333-3333-333333333328', 'other@tp28.local', '{}')
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values ('11111111-1111-1111-1111-111111111128', 'Owner')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa28',
        '11111111-1111-1111-1111-111111111128', 'TP28 Trip',
        '{"secret":"never-in-preview"}'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;

-- Same role discipline as 25/26/27: claims alone are not enough — the
-- Management API session owns the tables and bypasses RLS, so every deny
-- assertion needs an actual SET ROLE. anon() matters here for the first time:
-- invite_preview is the project's first invite surface reachable pre-auth.
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

-- NB: call with god() already in effect (language-sql plans under entry role).
create or replace function pg_temp.new_invite(p_role text, p_email text) returns text
language sql as $$
  insert into public.trip_invites (trip_id, email, role, invited_by, status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa28', p_email, p_role,
          '11111111-1111-1111-1111-111111111128', 'pending')
  returning token;
$$;

-- ---- 1) every row has a token, backfill included --------------------------
do $$
begin
  if exists (select 1 from public.trip_invites where token is null or length(token) < 32) then
    raise exception 'TP28-1 FAIL: an invite row is missing a real token';
  end if;
end $$;

-- ---- 2) anon previews a pending invite: exactly four sanitized fields -----
do $$
declare v_token text; v_preview jsonb;
begin
  perform pg_temp.god();
  v_token := pg_temp.new_invite('editor', 'anna@tp28.local');
  perform pg_temp.anon();
  v_preview := public.invite_preview(v_token);
  if v_preview is null then
    raise exception 'TP28-2 FAIL: anon cannot preview a live invite';
  end if;
  if v_preview ->> 'trip_name' is distinct from 'TP28 Trip'
     or v_preview ->> 'invited_by_name' is distinct from 'Owner'
     or v_preview ->> 'email' is distinct from 'anna@tp28.local'
     or v_preview ->> 'role' is distinct from 'editor' then
    raise exception 'TP28-2 FAIL: preview fields wrong: %', v_preview;
  end if;
  if (select count(*) from jsonb_object_keys(v_preview)) <> 4 then
    raise exception 'TP28-2 FAIL: preview grew beyond the four whitelisted fields: %', v_preview;
  end if;
  if v_preview::text like '%never-in-preview%' then
    raise exception 'TP28-2 FAIL: trip state leaked into the preview';
  end if;
  perform pg_temp.god();
end $$;

-- ---- 3) wrong / revoked / accepted tokens all preview as null -------------
do $$
declare v_revoked text; v_accepted text;
begin
  perform pg_temp.god();
  v_revoked  := pg_temp.new_invite('editor', 'anna@tp28.local');
  v_accepted := pg_temp.new_invite('editor', 'anna@tp28.local');
  update public.trip_invites set status = 'revoked'  where token = v_revoked;
  update public.trip_invites
     set status = 'accepted', accepted_by = '22222222-2222-2222-2222-222222222228'
   where token = v_accepted;
  perform pg_temp.anon();
  if public.invite_preview('no-such-token-ever') is not null then
    raise exception 'TP28-3 FAIL: a guessed token previews as live';
  end if;
  if public.invite_preview(v_revoked) is not null then
    raise exception 'TP28-3 FAIL: a REVOKED invite still previews';
  end if;
  if public.invite_preview(v_accepted) is not null then
    raise exception 'TP28-3 FAIL: an ACCEPTED invite still previews';
  end if;
  perform pg_temp.god();
end $$;

-- ---- 4) anon cannot even call accept_invite_by_token ----------------------
do $$
declare v_token text;
begin
  perform pg_temp.god();
  v_token := pg_temp.new_invite('editor', 'anna@tp28.local');
  perform pg_temp.anon();
  begin
    perform public.accept_invite_by_token(v_token);
    raise exception 'TP28-4 FAIL: anon executed accept_invite_by_token';
  exception
    when insufficient_privilege then null;  -- expected: no grant for anon
  end;
  perform pg_temp.god();
  delete from public.trip_invites where token = v_token;
end $$;

-- ---- 5) wrong email cannot accept; error matches the unknown-token one ----
do $$
declare v_token text; v_msg_wrong text; v_msg_unknown text;
begin
  perform pg_temp.god();
  v_token := pg_temp.new_invite('editor', 'anna@tp28.local');
  perform pg_temp.be('33333333-3333-3333-3333-333333333328', 'other@tp28.local');
  -- catch ONLY 42501 (what accept raises) so the FAIL raises below propagate
  begin
    perform public.accept_invite_by_token(v_token);
    raise exception 'TP28-5 FAIL: accepted an invite addressed to someone else';
  exception when insufficient_privilege then
    v_msg_wrong := sqlerrm;
  end;
  begin
    perform public.accept_invite_by_token('no-such-token-ever');
    raise exception 'TP28-5 FAIL: unknown token did not raise';
  exception when insufficient_privilege then
    v_msg_unknown := sqlerrm;
  end;
  if v_msg_wrong is distinct from v_msg_unknown then
    raise exception 'TP28-5 FAIL: wrong-email and unknown-token errors differ (% vs %)',
      v_msg_wrong, v_msg_unknown;
  end if;
  perform pg_temp.god();
  if exists (select 1 from public.trip_members
              where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa28'
                and user_id = '33333333-3333-3333-3333-333333333328') then
    raise exception 'TP28-5 FAIL: the wrong user gained membership anyway';
  end if;
  delete from public.trip_invites where token = v_token;
end $$;

-- ---- 6 + 7) the addressed user accepts; a revisit is idempotent -----------
do $$
declare v_token text; v_trip uuid; v_again uuid; v_role text;
begin
  perform pg_temp.god();
  v_token := pg_temp.new_invite('viewer', 'anna@tp28.local');
  perform pg_temp.be('22222222-2222-2222-2222-222222222228', 'anna@tp28.local');
  v_trip := public.accept_invite_by_token(v_token);
  if v_trip is distinct from 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa28' then
    raise exception 'TP28-6 FAIL: accept returned the wrong trip: %', v_trip;
  end if;
  v_again := public.accept_invite_by_token(v_token);  -- revisit after success
  if v_again is distinct from v_trip then
    raise exception 'TP28-7 FAIL: revisiting an accepted token errored or diverged';
  end if;
  perform pg_temp.god();
  select role into v_role from public.trip_members
   where trip_id = v_trip and user_id = '22222222-2222-2222-2222-222222222228';
  if v_role is distinct from 'viewer' then
    raise exception 'TP28-6 FAIL: invited as viewer, joined as %', coalesce(v_role, '<no row>');
  end if;
  -- the accepter's idempotent path must not open to OTHER users
  perform pg_temp.be('33333333-3333-3333-3333-333333333328', 'other@tp28.local');
  begin
    perform public.accept_invite_by_token(v_token);
    raise exception 'TP28-7 FAIL: a different user replayed an accepted token';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.god();
end $$;

rollback;
