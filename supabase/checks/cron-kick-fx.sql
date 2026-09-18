-- Fire the fx-refresh call exactly as the 02:00 job does, once, right now.
-- Harmless (it refreshes exchange rates) and the fastest end-to-end proof
-- that the signed headers are accepted: within a few seconds
--   tools/db.sh --<target> sql supabase/checks/push-fanout-health.sql
-- shows a new row — 200 with {"ok":true,...} means the chain works.
select net.http_post(
  url     := (select value from public.app_config where key = 'functions_url') || '/fx-refresh',
  headers := (select jsonb_build_object(
                'Content-Type', 'application/json',
                'x-cron-ts',  ts,
                'x-cron-sig', encode(extensions.hmac(ts, cs, 'sha256'), 'hex'))
              from (select extract(epoch from now())::bigint::text as ts,
                           (select value from public.app_config where key = 'cron_secret') as cs) s),
  body    := '{}'::jsonb) as request_id;
