-- ============================================================================
-- 40-subscription-alerts.sql — the daily job behind subscription reminders
-- (issue #37).
--
-- The feature needs NO new tables. A subscription is part of the trip document
-- (trips.state.subscriptions, jsonb) for the same reason state.extras and
-- state.reminders are: it is a planned cost, not a row of money that moved.
-- The charge that eventually lands is an ordinary ledger entry under the
-- `subscriptions` category, as it already was before this feature existed.
-- Dedupe reuses public.alert_log (08) and push routing reuses notify_prefs and
-- trip_notify (37). So this migration is one cron job and nothing else.
--
-- ONE THING TO KNOW ABOUT THE DEDUPE. alert_log is unique on
-- (trip_id, item_id, kind, sent_to) forever — deliberately, so a T-7 stay
-- warning can never fire twice. A subscription recurs, so the function puts the
-- CHARGE DATE in `kind` (`sub:2026-09-23`). Every occurrence is then its own
-- alert, and each is still sent at most once, ever. 40-TESTPLAN proves both
-- halves of that.
--
-- 07:30 UTC, half an hour after stay-deadline-alerts, so the two never contend
-- for the same Resend burst. Signed headers per 30/38 — hmac() is
-- schema-qualified because pgcrypto lives in `extensions` on Supabase and
-- pg_cron runs with the job owner's search_path. Idempotent: cron.schedule
-- replaces a job of the same name.
--
-- ORDER OF OPERATIONS: deploy the function FIRST, then apply this. A job
-- pointing at a function that does not exist yet 404s once a day in silence.
--
--     supabase functions deploy subscription-alerts --project-ref <ref>
--
-- (Docker must be running; see the digest note in docs/NOTES.md.)
--
-- AND CHECK IT ANSWERS 403, NOT 401. A newly deployed function defaults to
-- verify_jwt = true, and this job sends the signed x-cron-ts / x-cron-sig pair
-- with no Authorization header — so the platform refuses it with
-- 401 UNAUTHORIZED_NO_AUTH_HEADER before hasCronSecret ever runs. Silent, daily,
-- and the same shape as the outage 38 cleaned up. It happened on the first
-- staging deploy of this function (2026-09-20).
--
--     curl -s -o /dev/null -w '%{http_code}\n' -X POST \
--       https://<ref>.supabase.co/functions/v1/subscription-alerts
--
-- 403 = this function's own gate refusing an unsigned call, which is correct.
-- 401 = the platform's JWT gate; redeploy with --no-verify-jwt. The
-- [functions.subscription-alerts] block in supabase/config.toml is what stops
-- that regressing on the next deploy.
-- ============================================================================

select cron.schedule('subscription-alerts-daily', '30 7 * * *', $cron$
  select net.http_post(
    url     := (select value from public.app_config where key = 'functions_url') || '/subscription-alerts',
    headers := (select jsonb_build_object(
                  'Content-Type', 'application/json',
                  'x-cron-ts',  ts,
                  'x-cron-sig', encode(extensions.hmac(ts, cs, 'sha256'), 'hex'))
                from (select extract(epoch from now())::bigint::text as ts,
                             (select value from public.app_config where key = 'cron_secret') as cs) s),
    body    := '{}'::jsonb);
$cron$);

-- Guard against the class of failure 38 was written to clean up: if this job
-- ever ends up carrying the raw secret again, say so loudly here rather than
-- letting it 403 daily in silence.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'subscription-alerts-daily' and command like '%x-cron-secret%') then
    raise exception '40: subscription-alerts-daily is sending the raw secret — see 38-cron-signed.sql';
  end if;
end $$;

-- ============================================================================
-- Done. Run 40-TESTPLAN.sql.
-- ============================================================================
