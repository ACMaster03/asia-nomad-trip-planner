-- ============================================================================
-- 42-TESTPLAN.sql — idle sessions go, recent ones stay, and nobody but the
-- cron job can call the purge. Run against STAGING after 42. Rolls itself back.
-- ============================================================================

begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111142', 'owner@tp42.local', now())
on conflict (id) do nothing;

-- idle: last refreshed 91 days ago        → purged
-- fresh: created long ago, refreshed today → kept (refreshed_at wins)
-- recent: created 10 days ago, never refreshed → kept
insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at, ip, user_agent) values
  ('42000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111142',
   now() - interval '200 days', now() - interval '91 days', (now() - interval '91 days') at time zone 'utc',
   '203.0.113.1', 'tp42 idle'),
  ('42000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111142',
   now() - interval '200 days', now() - interval '200 days', now() at time zone 'utc',
   '203.0.113.2', 'tp42 fresh'),
  ('42000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111142',
   now() - interval '10 days', now() - interval '10 days', null,
   '203.0.113.3', 'tp42 recent');

insert into auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at) values
  ('tp42-idle-token', '11111111-1111-1111-1111-111111111142', '42000000-0000-0000-0000-000000000001',
   false, now() - interval '91 days', now() - interval '91 days');

do $$
declare v_n integer; v_ok boolean := false;
begin
  -- Only the tp42 rows are old enough on staging, but count them, not the total.
  perform public.purge_idle_sessions();

  if exists (select 1 from auth.sessions where id = '42000000-0000-0000-0000-000000000001') then
    raise exception 'TP42 FAIL: a session idle for 91 days survived';
  end if;
  if exists (select 1 from auth.refresh_tokens where token = 'tp42-idle-token') then
    raise exception 'TP42 FAIL: the idle session''s refresh token survived — the device could still refresh';
  end if;
  select count(*) into v_n from auth.sessions
   where id in ('42000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000003');
  if v_n <> 2 then
    raise exception 'TP42 FAIL: a session used within 90 days was purged (% of 2 left)', v_n;
  end if;

  -- Signed-in users must not be able to sign everyone else out.
  perform set_config('role', 'authenticated', true);
  begin
    perform public.purge_idle_sessions(interval '0 seconds');
  exception when insufficient_privilege then v_ok := true;
  end;
  perform set_config('role', 'none', true);
  if not v_ok then raise exception 'TP42 FAIL: authenticated could call purge_idle_sessions'; end if;

  if not exists (select 1 from cron.job where jobname = 'purge-idle-sessions') then
    raise exception 'TP42 FAIL: the nightly job is not scheduled';
  end if;
end $$;

select 'TP42 PASS' as result;
rollback;
