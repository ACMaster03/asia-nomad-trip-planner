-- Is the signed fan-out (migration 37) reaching push-fanout on this project?
-- Read-only. Run: tools/db.sh --prod sql supabase/checks/push-fanout-health.sql
--   1. both app_config keys must exist, or the trigger skips silently
--   2. recent pg_net responses: 200 + JSON body = the chain works;
--      403 = signature mismatch (CRON_SECRET vs app_config.cron_secret);
--      no rows after a check-in = the trigger never posted
select key, length(value) as value_len from public.app_config
 where key in ('functions_url', 'cron_secret') order by key;

select created, status_code, left(content, 160) as body, error_msg
  from net._http_response
 order by created desc
 limit 15;
