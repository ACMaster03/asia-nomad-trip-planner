-- ===========================================================================
-- 30 — cron auth: sign a timestamp, stop shipping the raw secret
-- ===========================================================================
-- Follow-up to 29. pg_net copies request headers VERBATIM into
-- net.http_request_queue, and on Supabase that table carries platform-pinned
-- PUBLIC grants that postgres cannot revoke (29 established this; TP29-7 is the
-- documented accepted risk). So every producer that put `x-cron-secret` in its
-- headers was parking the shared secret in a world-readable table.
--
-- Fix: producers no longer send the secret. They send a short-lived signature —
--   x-cron-ts:  <unix seconds>
--   x-cron-sig: encode(hmac(x-cron-ts, cron_secret, 'sha256'), 'hex')
-- and the edge functions (_shared/cronAuth.ts) recompute and check it within a
-- ±300s window. What lands in the queue is now a signature that reveals nothing
-- about the secret and expires within minutes. The secret itself stays only in
-- app_config.cron_secret (RLS-locked) and the functions' CRON_SECRET env, which
-- must hold the SAME value.
--
-- Residual, accepted: a signature scraped from the queue inside its window can
-- be replayed to the same endpoint (a redundant digest/fx run — no data
-- exposure, no secret disclosure). Binding the path into the signature is a
-- later refinement if it ever matters.
--
-- pgcrypto (hmac) is required; it is already enabled on both databases.
-- ---------------------------------------------------------------------------

-- 1) The push-fanout trigger function (13 → 27 → here). Preserves 27's
--    behaviour (fan out on every insert; the visibility gate lives in the
--    function itself). Only the headers change.
create or replace function public.notify_push_fanout()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url    text := (select value from public.app_config where key = 'functions_url');
  v_secret text := (select value from public.app_config where key = 'cron_secret');
  v_ts     text := extract(epoch from now())::bigint::text;
begin
  if v_url is not null and v_secret is not null then
    perform net.http_post(
      url     := v_url || '/push-fanout',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-ts',  v_ts,
                   'x-cron-sig', encode(hmac(v_ts, v_secret, 'sha256'), 'hex')),
      body    := jsonb_build_object('event_id', new.id)
    );
  end if;
  return null;
end $$;

-- 2) The three scheduled jobs. cron.schedule() upserts by name, so this both
--    swaps in the signed headers AND, for digest-send / stay-deadline-alerts,
--    removes the hardcoded raw secret that was sitting in cron.job.command —
--    reading url + secret from app_config makes every job project-agnostic
--    (identical on staging and prod). Schedules are unchanged.
select cron.schedule('fx-refresh-daily', '0 2 * * *', $cron$
  select net.http_post(
    url     := (select value from public.app_config where key = 'functions_url') || '/fx-refresh',
    headers := (select jsonb_build_object(
                  'Content-Type', 'application/json',
                  'x-cron-ts',  ts,
                  'x-cron-sig', encode(hmac(ts, cs, 'sha256'), 'hex'))
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
                  'x-cron-sig', encode(hmac(ts, cs, 'sha256'), 'hex'))
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
                  'x-cron-sig', encode(hmac(ts, cs, 'sha256'), 'hex'))
                from (select extract(epoch from now())::bigint::text as ts,
                             (select value from public.app_config where key = 'cron_secret') as cs) s),
    body    := '{}'::jsonb);
$cron$);
