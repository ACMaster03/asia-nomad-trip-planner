-- ============================================================================
-- 08-deadline-alerts.sql — stay-deadline email alerts, DB side (M1 item 8)
--
-- Idempotent, additive-only. Companion code: supabase/functions/stay-deadline-alerts/
-- (Edge Function that scans stays' cancelUntil/chargeDate and emails via Resend).
--
-- This migration only provides: the pg_cron/pg_net extensions and the dedupe
-- log. The cron.schedule() call itself is NOT here — it embeds the per-project
-- function URL + secret, so it is run once per environment from the function's
-- README (staging first, prod after the email path is verified).
-- ============================================================================

-- pg_cron ships enabled-able on all Supabase projects (Vercel Hobby's 2/day
-- cron limit is why scheduling lives here instead — see the approved plan).
create extension if not exists pg_cron;
-- pg_net lets the cron job invoke the Edge Function over HTTP.
create extension if not exists pg_net;

-- One row per alert actually sent — the function checks this before emailing,
-- so re-runs and overlapping schedules can never double-send. Append-only.
create table if not exists public.alert_log (
  id         bigint generated always as identity primary key,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  item_id    text not null,             -- Stay.id inside trips.state (jsonb)
  kind       text not null,             -- 'cancel-7' | 'cancel-3' | 'cancel-1' | 'charge-1'
  sent_to    text not null,             -- recipient email
  sent_at    timestamptz not null default now(),
  unique (trip_id, item_id, kind, sent_to)
);

-- Service-role only: the Edge Function reads/writes it with the service key;
-- clients have no business here (RLS on, no policies = deny all to anon/auth).
alter table public.alert_log enable row level security;
