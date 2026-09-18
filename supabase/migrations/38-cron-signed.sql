-- ============================================================================
-- 38-cron-signed.sql — the scheduled jobs sign their calls (30's cron block,
-- applied for real this time).
--
-- Found 2026-09-18 on prod: all three cron.job rows still carried the pre-30
-- raw `x-cron-secret` header, while every Edge Function has required the
-- signed x-cron-ts / x-cron-sig pair (_shared/cronAuth.ts) since 30 shipped.
-- Result: fx-refresh (02:00), stay-deadline-alerts (07:00) and digest-send
-- (13:00) were refused with 403 every day. 30's cron block never landed on
-- prod, and 30 must NOT be re-run now — its notify_push_fanout body would
-- overwrite 37's. This is the cron block alone, made defensive:
--
--   * any job still sending the raw secret is unscheduled, whatever its name
--   * the three jobs are (re)scheduled by name with the signed headers
--   * hmac() is schema-qualified: pgcrypto lives in `extensions` on Supabase
--     and pg_cron runs commands with the job owner's search_path
--
-- The raw secret sat in cron.job.command (and in the pg_net queue) until now,
-- so ROTATE it after applying: new value into app_config.cron_secret AND the
-- functions' CRON_SECRET (supabase secrets set). Idempotent.
-- ============================================================================

do $$
declare
  j record;
begin
  for j in select jobid, jobname from cron.job where command like '%x-cron-secret%' loop
    perform cron.unschedule(j.jobid);
    raise notice '38: unscheduled raw-secret job % (jobid %)', j.jobname, j.jobid;
  end loop;
end $$;

select cron.schedule('fx-refresh-daily', '0 2 * * *', $cron$
  select net.http_post(
    url     := (select value from public.app_config where key = 'functions_url') || '/fx-refresh',
    headers := (select jsonb_build_object(
                  'Content-Type', 'application/json',
                  'x-cron-ts',  ts,
                  'x-cron-sig', encode(extensions.hmac(ts, cs, 'sha256'), 'hex'))
                from (select extract(epoch from now())::bigint::text as ts,
                             (select value from public.app_config where key = 'cron_secret') as cs) s),
    body    := '{}'::jsonb);
$cron$);

select cron.schedule('digest-send-daily', '0 13 * * *', $cron$
  select net.http_post(
    url     := (select value from public.app_config where key = 'functions_url') || '/digest-send',
    headers := (select jsonb_build_object(
                  'Content-Type', 'application/json',
                  'x-cron-ts',  ts,
                  'x-cron-sig', encode(extensions.hmac(ts, cs, 'sha256'), 'hex'))
                from (select extract(epoch from now())::bigint::text as ts,
                             (select value from public.app_config where key = 'cron_secret') as cs) s),
    body    := '{}'::jsonb);
$cron$);

select cron.schedule('stay-deadline-alerts-daily', '0 7 * * *', $cron$
  select net.http_post(
    url     := (select value from public.app_config where key = 'functions_url') || '/stay-deadline-alerts',
    headers := (select jsonb_build_object(
                  'Content-Type', 'application/json',
                  'x-cron-ts',  ts,
                  'x-cron-sig', encode(extensions.hmac(ts, cs, 'sha256'), 'hex'))
                from (select extract(epoch from now())::bigint::text as ts,
                             (select value from public.app_config where key = 'cron_secret') as cs) s),
    body    := '{}'::jsonb);
$cron$);

-- ============================================================================
-- Done. Run 38-TESTPLAN.sql, then rotate the cron secret (see header).
-- ============================================================================
