-- ============================================================================
-- 38-TESTPLAN.sql — the scheduled jobs are signed and the signature computes.
-- Read-only assertions; safe on prod.
-- ============================================================================
do $$
declare
  raw_n  int;
  sig_n  int;
  missing text;
  probe  text;
begin
  select count(*) into raw_n from cron.job where command like '%x-cron-secret%';
  if raw_n <> 0 then
    raise exception 'TP38 FAIL: % job(s) still send the raw secret', raw_n;
  end if;

  select string_agg(n, ', ') into missing
  from unnest(array['fx-refresh-daily', 'digest-send-daily', 'stay-deadline-alerts-daily']) n
  where not exists (select 1 from cron.job j
                     where j.jobname = n and j.active and j.command like '%x-cron-sig%'
                       and j.command like '%extensions.hmac%');
  if missing is not null then
    raise exception 'TP38 FAIL: not scheduled signed: %', missing;
  end if;

  select count(*) into sig_n from cron.job
   where jobname = 'fx-refresh-daily'           and schedule = '0 2 * * *'
      or jobname = 'digest-send-daily'          and schedule = '0 13 * * *'
      or jobname = 'stay-deadline-alerts-daily' and schedule = '0 7 * * *';
  if sig_n <> 3 then
    raise exception 'TP38 FAIL: schedules drifted (% of 3 match)', sig_n;
  end if;

  -- The exact expression the jobs run, evaluated here as the same role.
  select encode(extensions.hmac(ts, cs, 'sha256'), 'hex') into probe
  from (select extract(epoch from now())::bigint::text as ts,
               (select value from public.app_config where key = 'cron_secret') as cs) s;
  if probe is null or length(probe) <> 64 then
    raise exception 'TP38 FAIL: signature does not compute — is app_config.cron_secret set?';
  end if;

  raise notice 'TP38 OK: 3 signed jobs, no raw secret, signature computes';
end $$;
