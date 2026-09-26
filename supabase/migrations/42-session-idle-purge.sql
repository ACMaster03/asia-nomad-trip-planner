-- ============================================================================
-- 42-session-idle-purge.sql — a signed-in device is forgotten after 90 days idle.
--
-- Every row in auth.sessions carries the IP address and user-agent the device
-- signed in from. Nothing ended them but a sign-out, so for most people they
-- lived forever. /privacy now says "after 90 days without using the app on it",
-- and this job is what makes that sentence true.
--
-- WHY NOT THE AUTH SETTING. Supabase Auth has `sessions.inactivity_timeout` for
-- exactly this, but it is a Pro feature: pushing it answered 402 "User sessions
-- can only be configured on Pro Plans and up" (staging, 2026-09-26). If the
-- project ever moves to Pro, set it in supabase/config.toml and drop this job.
--
-- WHAT A DELETE DOES. refresh_tokens and mfa_amr_claims reference the session
-- ON DELETE CASCADE, so the device can no longer refresh; its current access
-- token (1 hour, jwt_expiry) runs out and it is signed out. No timebox: an active
-- traveller is never signed out mid-trip, only a device nobody has opened.
--
-- "Last used" is the latest of refreshed_at (timestamp WITHOUT time zone, UTC),
-- updated_at and created_at; greatest() skips nulls.
--
-- Idempotent. cron.schedule() upserts by name. Depends on pg_cron (08).
-- ============================================================================

create or replace function public.purge_idle_sessions(p_idle interval default interval '90 days')
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  delete from auth.sessions s
   where greatest(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at) < now() - p_idle;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.purge_idle_sessions(interval) from public, anon, authenticated;

select cron.schedule('purge-idle-sessions', '17 3 * * *', $cron$
  select public.purge_idle_sessions();
$cron$);

-- ============================================================================
-- Done. Run 42-TESTPLAN.sql.
-- ============================================================================
