-- ============================================================================
-- 27-traveller-push.sql — traveller push notifications (M0-gate gap 4).
--
-- Followers already get Web Push (migration 13): subscriptions keyed to a
-- SHARE LINK, RPC-only, because followers have no accounts. Travellers DO
-- have accounts, so their subscriptions are a plain RLS-owned table keyed to
-- user_id — no RPCs needed, the row is the user's own data.
--
-- transport: 'webpush' today (endpoint = push-service URL, p256dh/auth keys);
-- 'apns' reserved for the SwiftUI companion (endpoint = device token, key
-- columns null) so the native app lands WITHOUT another migration after the
-- RLS freeze. The check constraint pins the shape per transport.
--
-- Preferences live on profiles (one row per user, user-updatable since 03;
-- is_admin stays guarded by profiles_guard_admin, which only inspects that
-- column). Both default TRUE: the real opt-in is registering a device at all —
-- no subscription means no push, whatever the flags say.
--   notify_deadline_push — stay deadlines (cancel T-7/T-1, charge T-1); email
--                          stays on regardless: a cancel-by date is real money
--                          and push delivery on iOS is best-effort.
--   notify_event_push    — co-traveller check-ins / arrivals / notes.
--
-- Fan-out: migration 13's trigger fired only for follower-visible events;
-- travellers must hear about 'private' events too, so the trigger now fires
-- for EVERY insert and the push-fanout Edge Function decides per audience
-- (followers only when visibility allows; members always, minus the author).
--
-- Account deletion (26): the user_id FK cascades, so delete_my_account() needs
-- no change — erasing auth.users takes the subscriptions with it.
--
-- Idempotent, additive-only. Depends on 03 (profiles), 10 (trip_events),
-- 13 (app_config + push-fanout wiring). Run on staging first (27-TESTPLAN.sql),
-- then prod, then deploy the updated Edge Functions.
-- ============================================================================

create table if not exists public.user_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  transport  text not null default 'webpush' check (transport in ('webpush', 'apns')),
  endpoint   text not null unique,  -- webpush: push-service URL · apns: device token
  p256dh     text,                  -- webpush encryption keys; null for apns
  auth       text,
  created_at timestamptz not null default now(),
  constraint user_push_shape check (
    (transport = 'webpush' and p256dh is not null and auth is not null)
    or transport = 'apns'
  )
);
create index if not exists user_push_subscriptions_user_idx
  on public.user_push_subscriptions (user_id);

alter table public.user_push_subscriptions enable row level security;

-- Owner-only, all four verbs. INSERT/UPDATE both pin user_id to the caller:
-- you cannot register a device for someone else, and an upsert that lands on
-- another user's endpoint row is refused by USING before WITH CHECK matters.
drop policy if exists user_push_select on public.user_push_subscriptions;
create policy user_push_select on public.user_push_subscriptions for select
  using (user_id = auth.uid());

drop policy if exists user_push_insert on public.user_push_subscriptions;
create policy user_push_insert on public.user_push_subscriptions for insert
  with check (user_id = auth.uid());

drop policy if exists user_push_update on public.user_push_subscriptions;
create policy user_push_update on public.user_push_subscriptions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_push_delete on public.user_push_subscriptions;
create policy user_push_delete on public.user_push_subscriptions for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notification preferences.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists notify_deadline_push boolean not null default true,
  add column if not exists notify_event_push    boolean not null default true;

-- ---------------------------------------------------------------------------
-- Fan-out trigger now fires for EVERY event; the Edge Function routes:
--   followers  → only when visibility in ('followers','public')  (unchanged)
--   travellers → every visibility, minus the author, prefs permitting
-- Same missing-config short-circuit as 13: a fresh dev DB must not break
-- check-ins over an unreachable function.
-- ---------------------------------------------------------------------------
create or replace function public.notify_push_fanout()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url    text := (select value from public.app_config where key = 'functions_url');
  v_secret text := (select value from public.app_config where key = 'cron_secret');
begin
  if v_url is not null and v_secret is not null then
    perform net.http_post(
      url     := v_url || '/push-fanout',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-cron-secret', v_secret),
      body    := jsonb_build_object('event_id', new.id)
    );
  end if;
  return null;
end $$;
-- (trigger trip_events_push_fanout from 13 already points at this function;
-- CREATE OR REPLACE swaps the body in place.)
