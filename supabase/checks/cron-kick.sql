-- Prove that a signed call from THIS database is accepted, without side
-- effects: push-fanout with a nil event id answers 200
-- {"sent":0,"reason":"no such event"} when the signature is right, and
-- 403 "forbidden" when it is not. push-fanout is the function to probe
-- because it is redeployed with every fan-out change; fx-refresh sat on a
-- pre-30 build for weeks and still expected the raw header (2026-09-18).
-- Within a few seconds afterwards:
--   tools/db.sh --<target> sql supabase/checks/push-fanout-health.sql
select net.http_post(
  url     := (select value from public.app_config where key = 'functions_url') || '/push-fanout',
  headers := (select jsonb_build_object(
                'Content-Type', 'application/json',
                'x-cron-ts',  ts,
                'x-cron-sig', encode(extensions.hmac(ts, cs, 'sha256'), 'hex'))
              from (select extract(epoch from now())::bigint::text as ts,
                           (select value from public.app_config where key = 'cron_secret') as cs) s),
  body    := '{"event_id":"00000000-0000-0000-0000-000000000000"}'::jsonb) as request_id;
