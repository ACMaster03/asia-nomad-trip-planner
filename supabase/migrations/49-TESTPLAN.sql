-- ============================================================================
-- 49-TESTPLAN.sql — usage counts (#120): the feed marks and the account sources.
-- Production only since 25 Oct: run it inside the rolled-back dry run of 49
-- first (begin; + 49 + this file without its begin;). It makes its own tp49
-- users, journey and links, reads back only those, and rolls itself back.
--
-- A pass is "Success" with no rows; any failure stops with an error that
-- starts "TP49 FAIL".
-- ============================================================================

begin;

-- created_at is set for the old follower only: three days old, past the
-- 24-hour window in which a source is noted. The rest are new accounts.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at) values
  ('11111111-1111-1111-1111-111111111149', 'owner@tp49.local',    now(), '{"first_name":"Olga"}', now()),
  ('22222222-2222-2222-2222-222222222249', 'newfan@tp49.local',   now(), '{"first_name":"Nora"}', now()),
  ('33333333-3333-3333-3333-333333333349', 'oldfan@tp49.local',   now(), '{"first_name":"Otto"}', now() - interval '3 days'),
  ('44444444-4444-4444-4444-444444444449', 'partner@tp49.local',  now(), '{"first_name":"Pia"}',  now()),
  ('55555555-5555-5555-5555-555555555549', 'stranger@tp49.local', now(), '{"first_name":"Sam"}',  now())
on conflict (id) do nothing;

insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa49', '11111111-1111-1111-1111-111111111149', 'TP49 Trip',
        '{"meta":{"tripName":"TP49 Trip","startDate":"2026-10-01"},"segments":[]}'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;

-- Two follow links: one live, one paused.
insert into public.trip_shares (id, trip_id, token_hash, token_prefix, created_by, paused_at) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb49', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa49',
   encode(sha256('tp49-live-token'::bytea), 'hex'), 'tp49li', '11111111-1111-1111-1111-111111111149', null),
  ('cccccccc-cccc-cccc-cccc-cccccccccc49', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa49',
   encode(sha256('tp49-paused-token'::bytea), 'hex'), 'tp49pa', '11111111-1111-1111-1111-111111111149', now())
on conflict (id) do nothing;

-- Two pending invitations from the owner: the partner's, and one for the new
-- follower (to show the first door wins).
insert into public.trip_invites (id, trip_id, email, role, invited_by) values
  ('dddddddd-dddd-dddd-dddd-dddddddddd49', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa49', 'partner@tp49.local', 'editor', '11111111-1111-1111-1111-111111111149'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee49', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa49', 'newfan@tp49.local',  'editor', '11111111-1111-1111-1111-111111111149')
on conflict (id) do nothing;

-- Same role discipline as 25–47: the migration session bypasses RLS, so every
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

-- Marks for this plan's own people and links only; production has real ones.
create or replace function pg_temp.marks(p_id uuid) returns int
language sql as $$
  select count(*)::int from public.feed_open_days
  where day = current_date and coalesce(follower_id, share_id) = p_id;
$$;

do $$
declare
  c_trip    constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa49';
  c_owner   constant uuid := '11111111-1111-1111-1111-111111111149';
  c_newfan  constant uuid := '22222222-2222-2222-2222-222222222249';
  c_oldfan  constant uuid := '33333333-3333-3333-3333-333333333349';
  c_partner constant uuid := '44444444-4444-4444-4444-444444444449';
  c_strange constant uuid := '55555555-5555-5555-5555-555555555549';
  c_live    constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb49';
  c_paused  constant uuid := 'cccccccc-cccc-cccc-cccc-cccccccccc49';
  v_src     public.account_sources;
  v_n       int;
begin
  -- 1) A new account that follows through a link is noted as follow_link,
  --    with the journey the link led to.
  perform pg_temp.be(c_newfan, 'newfan@tp49.local');
  if public.follow_by_token('tp49-live-token') is null then
    perform pg_temp.god();
    raise exception 'TP49 FAIL: the new follower could not follow through the link';
  end if;
  perform pg_temp.god();
  select * into v_src from public.account_sources where user_id = c_newfan;
  if v_src.source is distinct from 'follow_link' or v_src.trip_id is distinct from c_trip then
    raise exception 'TP49 FAIL: the new follower''s source is % / %', v_src.source, v_src.trip_id;
  end if;

  -- 2) An account older than 24 hours gets no source from a follow.
  perform pg_temp.be(c_oldfan, 'oldfan@tp49.local');
  perform public.follow_by_token('tp49-live-token');
  perform pg_temp.god();
  if exists (select 1 from public.account_sources where user_id = c_oldfan) then
    raise exception 'TP49 FAIL: a three-day-old account got a source';
  end if;
  if not exists (select 1 from public.user_follows where follower_id = c_oldfan) then
    raise exception 'TP49 FAIL: the old follower''s follow did not land';
  end if;

  -- 3) A new account that accepts a partner's invitation is partner_invite.
  perform pg_temp.be(c_partner, 'partner@tp49.local');
  perform public.accept_invite('dddddddd-dddd-dddd-dddd-dddddddddd49');
  perform pg_temp.god();
  select * into v_src from public.account_sources where user_id = c_partner;
  if v_src.source is distinct from 'partner_invite' or v_src.trip_id is distinct from c_trip then
    raise exception 'TP49 FAIL: the partner''s source is % / %', v_src.source, v_src.trip_id;
  end if;

  -- 4) Anyone with the live link, signed out: one mark for the link, however
  --    often it is opened today.
  perform pg_temp.anon();
  perform public.mark_feed_open('tp49-live-token');
  perform public.mark_feed_open('tp49-live-token');
  perform pg_temp.god();
  v_n := pg_temp.marks(c_live);
  if v_n <> 1 then
    raise exception 'TP49 FAIL: the live link has % marks today, not 1', v_n;
  end if;

  -- 5) A paused link and an unknown token mark nothing, and raise nothing.
  perform pg_temp.anon();
  perform public.mark_feed_open('tp49-paused-token');
  perform public.mark_feed_open('tp49-no-such-token');
  perform pg_temp.god();
  v_n := pg_temp.marks(c_paused);
  if v_n <> 0 then
    raise exception 'TP49 FAIL: the paused link was marked';
  end if;

  -- 6) A follower on Home (no token): one mark as themselves; the link page
  --    the same day adds nothing.
  perform pg_temp.be(c_oldfan, 'oldfan@tp49.local');
  perform public.mark_feed_open();
  perform public.mark_feed_open();
  perform public.mark_feed_open('tp49-live-token');
  perform pg_temp.god();
  v_n := pg_temp.marks(c_oldfan);
  if v_n <> 1 then
    raise exception 'TP49 FAIL: the follower has % marks today, not 1', v_n;
  end if;

  -- 7) A signed-in account that follows nobody: nothing on Home; on the link
  --    page it counts as the link (still one mark for it), never as itself.
  perform pg_temp.be(c_strange, 'stranger@tp49.local');
  perform public.mark_feed_open();
  perform public.mark_feed_open('tp49-live-token');
  perform pg_temp.god();
  if pg_temp.marks(c_strange) <> 0 then
    raise exception 'TP49 FAIL: an account that follows nobody was marked as itself';
  end if;
  v_n := pg_temp.marks(c_live);
  if v_n <> 1 then
    raise exception 'TP49 FAIL: the live link has % marks after the stranger, not 1', v_n;
  end if;

  -- 8) The journey's own travellers looking at their link are not marked.
  perform pg_temp.be(c_owner, 'owner@tp49.local');
  perform public.mark_feed_open('tp49-live-token');
  perform pg_temp.be(c_partner, 'partner@tp49.local');
  perform public.mark_feed_open('tp49-live-token');
  perform pg_temp.god();
  if pg_temp.marks(c_owner) + pg_temp.marks(c_partner) <> 0 then
    raise exception 'TP49 FAIL: a traveller was marked on their own link';
  end if;

  -- 9) The first door wins: the new follower accepting an invitation later
  --    stays follow_link.
  perform pg_temp.be(c_newfan, 'newfan@tp49.local');
  perform public.accept_invite('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee49');
  perform pg_temp.god();
  select * into v_src from public.account_sources where user_id = c_newfan;
  if v_src.source is distinct from 'follow_link' then
    raise exception 'TP49 FAIL: a later invitation replaced the source with %', v_src.source;
  end if;

  -- 10) The public key can neither read nor write the two tables, nor call
  --     the internal function.
  perform pg_temp.be(c_oldfan, 'oldfan@tp49.local');
  begin
    perform 1 from public.feed_open_days limit 1;
    perform pg_temp.god();
    raise exception 'TP49 FAIL: authenticated can read feed_open_days';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.account_sources limit 1;
    perform pg_temp.god();
    raise exception 'TP49 FAIL: authenticated can read account_sources';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.feed_open_days (follower_id) values (c_oldfan);
    perform pg_temp.god();
    raise exception 'TP49 FAIL: authenticated can write feed_open_days';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public._note_signup_source(c_oldfan, 'follow_link', c_trip);
    perform pg_temp.god();
    raise exception 'TP49 FAIL: authenticated can call _note_signup_source';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.anon();
  begin
    perform 1 from public.feed_open_days limit 1;
    perform pg_temp.god();
    raise exception 'TP49 FAIL: anon can read feed_open_days';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.god();

  -- 11) The 12-month deletion job is scheduled.
  if not exists (select 1 from cron.job where jobname = 'feed-open-days-purge-daily'
                  and command like '%feed_open_days%12 months%') then
    raise exception 'TP49 FAIL: the purge job is missing';
  end if;
end $$;

rollback;
