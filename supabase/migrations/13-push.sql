-- ============================================================================
-- 13-push.sql — M3 Web Push (free: VAPID, no vendor).
--
-- Followers have no accounts: a subscription belongs to a SHARE LINK
-- (share_id fk) — revoking the link cascades its subscriptions away, exactly
-- as mock 09 promises. The table is RPC-only (RLS deny-all): subscribe
-- requires a live token; unsubscribe requires knowing the endpoint URL
-- (itself an unguessable push-service URL — same entropy model as tokens).
-- The raw token is NEVER stored — notification clicks find their way back to
-- the follow page from device-local state, not from our database.
--
-- Fan-out: an AFTER INSERT trigger on follower-visible trip_events fires
-- pg_net at the push-fanout Edge Function. Function URL + shared secret live
-- in app_config (RLS deny-all; the definer trigger bypasses it) — seeded per
-- environment OUTSIDE this file; secrets never enter the repo. (Database
-- GUCs would be cleaner but Supabase's postgres role may not ALTER DATABASE.)
--
-- Idempotent, additive-only. Depends on 10 (trip_events), 11 (trip_shares).
-- ============================================================================

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  share_id   uuid not null references public.trip_shares (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_share_idx on public.push_subscriptions (share_id);

alter table public.push_subscriptions enable row level security;
-- deny-all on purpose: no policies — access is via the definer RPCs below.

-- ---------------------------------------------------------------------------
create or replace function public.subscribe_push(
  p_token text, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_share public.trip_shares;
begin
  v_share := public._share_for_token(p_token);
  if v_share.id is null then
    raise exception 'invalid link' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (share_id, endpoint, p256dh, auth)
  values (v_share.id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set share_id = excluded.share_id,
        p256dh   = excluded.p256dh,
        auth     = excluded.auth;
end $$;
revoke all on function public.subscribe_push(text, text, text, text) from public;
grant execute on function public.subscribe_push(text, text, text, text) to anon, authenticated;

create or replace function public.unsubscribe_push(p_endpoint text)
returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;
revoke all on function public.unsubscribe_push(text) from public;
grant execute on function public.unsubscribe_push(text) to anon, authenticated;

-- Private key-value config for definer functions (functions_url, cron_secret).
-- RLS with no policies = invisible to every client role; only definer
-- functions owned by postgres read it.
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fan-out trigger: follower-visible events poke the Edge Function (async via
-- pg_net — the insert never waits on push delivery). Missing config (fresh
-- dev db) → silently skip rather than break check-ins.
-- ---------------------------------------------------------------------------
create or replace function public.notify_push_fanout()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url    text := (select value from public.app_config where key = 'functions_url');
  v_secret text := (select value from public.app_config where key = 'cron_secret');
begin
  if new.visibility in ('followers', 'public')
     and v_url is not null and v_secret is not null then
    perform net.http_post(
      url     := v_url || '/push-fanout',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-cron-secret', v_secret),
      body    := jsonb_build_object('event_id', new.id)
    );
  end if;
  return null;
end $$;

drop trigger if exists trip_events_push_fanout on public.trip_events;
create trigger trip_events_push_fanout
  after insert on public.trip_events
  for each row execute function public.notify_push_fanout();
