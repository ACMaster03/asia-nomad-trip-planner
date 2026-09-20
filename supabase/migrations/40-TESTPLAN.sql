-- ============================================================================
-- 40-TESTPLAN.sql — the subscription job is scheduled and signed, and the
-- dedupe key lets a RECURRING reminder recur.
-- Run against STAGING after 40. Rolls itself back.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) The job: present, signed, computes.
-- ---------------------------------------------------------------------------
do $$
declare
  cmd text;
  sched text;
  probe text;
begin
  select command, schedule into cmd, sched from cron.job where jobname = 'subscription-alerts-daily';
  if cmd is null then
    raise exception 'TP40 FAIL: subscription-alerts-daily is not scheduled — was 40 applied?';
  end if;
  if sched <> '30 7 * * *' then
    raise exception 'TP40 FAIL: schedule drifted to %', sched;
  end if;
  if cmd like '%x-cron-secret%' then
    raise exception 'TP40 FAIL: the job sends the raw secret (see 38-cron-signed.sql)';
  end if;
  if cmd not like '%x-cron-sig%' or cmd not like '%/subscription-alerts%' then
    raise exception 'TP40 FAIL: the job is not the signed call to /subscription-alerts';
  end if;

  select encode(extensions.hmac(ts, cs, 'sha256'), 'hex') into probe
  from (select extract(epoch from now())::bigint::text as ts,
               (select value from public.app_config where key = 'cron_secret') as cs) s;
  if probe is null or length(probe) <> 64 then
    raise exception 'TP40 FAIL: signature does not compute — is app_config.cron_secret set?';
  end if;

  raise notice 'TP40 OK (1/2): the job is scheduled at 07:30, signed, and computes';
end $$;

-- ---------------------------------------------------------------------------
-- 2) The dedupe key. THE POINT OF THIS TEST: alert_log is unique on
--    (trip, item, kind, recipient) forever, which would swallow October's
--    reminder as a duplicate of September's if `kind` were constant. The
--    function puts the charge date in it. Prove both halves:
--      a) the same subscription alerts again next month, and
--      b) the same occurrence never alerts twice.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111140', 'owner@tp40.local', now(), '{"first_name":"Patrik"}')
on conflict (id) do nothing;
insert into public.profiles (id) values ('11111111-1111-1111-1111-111111111140')
on conflict (id) do nothing;
insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa40', '11111111-1111-1111-1111-111111111140', 'TP40 Trip',
        '{"meta":{"tripName":"TP40 Trip","startDate":"2026-08-31","endDate":"2027-02-25"},"segments":[],
          "subscriptions":[{"id":"sub-net","label":"Home internet","cur":"HUF","amount":7990,
                            "everyMonths":1,"anchor":"2026-08-23","remind":true,"leadDays":3}]}'::jsonb,
        '[]'::jsonb)
on conflict (id) do nothing;

do $$
declare
  v_trip uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa40';
  v_again boolean := false;
  v_twice boolean := false;
begin
  -- September's occurrence, sent.
  insert into public.alert_log (trip_id, item_id, kind, sent_to)
  values (v_trip, 'sub-net', 'sub:2026-09-23', 'owner@tp40.local');

  -- (a) October's is a DIFFERENT alert and must go through.
  begin
    insert into public.alert_log (trip_id, item_id, kind, sent_to)
    values (v_trip, 'sub-net', 'sub:2026-10-23', 'owner@tp40.local');
    v_again := true;
  exception when unique_violation then
    v_again := false;
  end;
  if not v_again then
    raise exception 'TP40 FAIL: next month''s reminder was swallowed as a duplicate — the charge date is not in `kind`';
  end if;

  -- (b) September's occurrence must never be sent twice.
  begin
    insert into public.alert_log (trip_id, item_id, kind, sent_to)
    values (v_trip, 'sub-net', 'sub:2026-09-23', 'owner@tp40.local');
    v_twice := true;
  exception when unique_violation then
    v_twice := false;
  end;
  if v_twice then
    raise exception 'TP40 FAIL: the same occurrence alerted twice — alert_log is not deduping';
  end if;

  -- and the two channels still dedupe independently (push:<uid> vs email)
  insert into public.alert_log (trip_id, item_id, kind, sent_to)
  values (v_trip, 'sub-net', 'sub:2026-09-23', 'push:11111111-1111-1111-1111-111111111140');

  raise notice 'TP40 OK (2/2): each occurrence alerts once, and next month still alerts';
end $$;

rollback;

-- ============================================================================
-- Expected: two OK notices, no exceptions. Everything above is rolled back.
--
-- NOT covered here, because it lives in the function and not in the database:
-- the next-charge arithmetic (anchor + cadence, month-end clamping, cancelled
-- as a state). That is pinned by the app's node tests —
-- product/src/lib/trips/subscriptions.test.ts — against which
-- supabase/functions/_shared/subscriptionSchedule.ts is a deliberate copy.
-- ============================================================================
