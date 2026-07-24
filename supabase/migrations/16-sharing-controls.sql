-- ============================================================================
-- 16-sharing-controls.sql — M3 polish: pause-all sharing, follower counts,
-- email digests (daily/weekly).
--
-- Pause: per-share paused_at. Paused links stay VALID (mock 07 "Sharing
-- paused" state — softer than revoking): the follower page keeps the trip
-- title but shows nothing else, push fan-out and digests are muted, and
-- resuming un-mutes everything without re-opt-in.
--
-- Digests: followers with no push (iOS browser tabs, or preference) leave an
-- email + frequency. Double opt-in (confirm link) so the form can't be used
-- to spam third parties. The confirm token is hashed at rest (one-shot, we
-- emailed it); the unsubscribe token is stored RAW on purpose — it must go
-- into every outgoing digest, and leaking it only lets someone unsubscribe
-- an email, never read trip data.
--
-- Idempotent, additive-only. Depends on 11 (trip_shares), 12 (shared_feed v2),
-- 13 (push_subscriptions).
-- ============================================================================

alter table public.trip_shares add column if not exists paused_at timestamptz;

-- ---------------------------------------------------------------------------
-- Owner control: pause/resume EVERY live link of a trip at once (mock 09's
-- hero-card switch). Revoked links are left untouched.
-- ---------------------------------------------------------------------------
create or replace function public.set_trip_sharing_paused(p_trip uuid, p_paused boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_edit_trip(p_trip) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.trip_shares
     set paused_at = case when p_paused then coalesce(paused_at, now()) else null end
   where trip_id = p_trip and revoked_at is null;
end $$;
revoke all on function public.set_trip_sharing_paused(uuid, boolean) from public, anon;
grant execute on function public.set_trip_sharing_paused(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- shared_trip_summary: paused links answer ONLY {paused, tripName} — the
-- follower keeps context ("this is still Mom's link") but sees no route, no
-- dates, no last-seen while paused.
-- ---------------------------------------------------------------------------
create or replace function public.shared_trip_summary(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_share public.trip_shares;
  v_trip  public.trips;
begin
  v_share := public._share_for_token(p_token);
  if v_share.id is null then return null; end if;
  select * into v_trip from public.trips where id = v_share.trip_id;
  if v_trip.id is null then return null; end if;
  if v_share.paused_at is not null then
    return jsonb_build_object(
      'paused', true,
      'tripName', v_trip.state->'meta'->>'tripName'
    );
  end if;
  return jsonb_build_object(
    'tripName',  v_trip.state->'meta'->>'tripName',
    'startDate', v_trip.state->'meta'->>'startDate',
    'endDate',   v_trip.state->'meta'->>'endDate',
    'route', coalesce((
      select jsonb_agg(jsonb_build_object(
               'city',    seg->>'city',
               'country', seg->>'country',
               'arrive',  seg->>'arrive',
               'depart',  seg->>'depart',
               'lat',     c.lat,
               'lng',     c.lng
             ) order by seg->>'arrive')
      from jsonb_array_elements(coalesce(v_trip.state->'segments', '[]'::jsonb)) seg
      left join public.cities c on c.city = seg->>'city'
      where coalesce((seg->>'include')::boolean, true)
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.shared_trip_summary(text) from public;
grant execute on function public.shared_trip_summary(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- shared_feed: paused → empty. Otherwise unchanged from migration 12
-- (photos whitelist preserved).
-- ---------------------------------------------------------------------------
create or replace function public.shared_feed(
  p_token text, p_before timestamptz default null, p_limit int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_share public.trip_shares;
begin
  v_share := public._share_for_token(p_token);
  if v_share.id is null then return null; end if;
  if v_share.paused_at is not null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(row_ev order by occurred_at desc) from (
      select e.occurred_at,
             jsonb_build_object(
               'id', e.id,
               'kind', e.kind,
               'occurred_at', e.occurred_at,
               'payload', case e.kind
                 when 'checkin' then jsonb_build_object(
                   'placeName', e.payload->>'placeName',
                   'photos', coalesce((
                     select jsonb_agg(p) from jsonb_array_elements_text(e.payload->'photos') p
                   ), '[]'::jsonb))
                 when 'note'    then jsonb_build_object('text', e.payload->>'text')
                 when 'arrived' then jsonb_build_object('city', e.payload->>'city')
                 else '{}'::jsonb
               end,
               'rating',  ci.rating,
               'comment', ci.comment
             ) as row_ev
      from public.trip_events e
      left join public.check_ins ci on ci.event_id = e.id
      where e.trip_id = v_share.trip_id
        and e.visibility in ('followers', 'public')
        and (p_before is null or e.occurred_at < p_before)
      order by e.occurred_at desc
      limit least(greatest(p_limit, 1), 50)
    ) sub
  ), '[]'::jsonb);
end $$;
revoke all on function public.shared_feed(text, timestamptz, int) from public;
grant execute on function public.shared_feed(text, timestamptz, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Email digest subscriptions. RLS deny-all: the follower-facing lifecycle
-- (subscribe/confirm/unsubscribe) lives in the `digest` Edge Function with
-- the service role; owners only ever see COUNTS via share_follower_stats.
-- ---------------------------------------------------------------------------
create table if not exists public.digest_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  share_id           uuid not null references public.trip_shares (id) on delete cascade,
  email              text not null,
  frequency          text not null default 'daily' check (frequency in ('daily', 'weekly')),
  confirm_token_hash text not null,
  unsub_token        text not null,
  confirmed_at       timestamptz,
  confirm_sent_at    timestamptz,
  last_sent_at       timestamptz,
  created_at         timestamptz not null default now(),
  unique (share_id, email)
);
create index if not exists digest_subscriptions_share_idx on public.digest_subscriptions (share_id);
alter table public.digest_subscriptions enable row level security;
-- deny-all on purpose: no policies.
revoke all on public.digest_subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Owner-facing follower counts per live share (mock 09 hero card + per-row
-- meta). Counts only — never endpoints or email addresses.
-- ---------------------------------------------------------------------------
create or replace function public.share_follower_stats(p_trip uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_edit_trip(p_trip) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'share_id', s.id,
             'push',  (select count(*) from public.push_subscriptions p
                        where p.share_id = s.id),
             'email', (select count(*) from public.digest_subscriptions d
                        where d.share_id = s.id and d.confirmed_at is not null)
           ))
    from public.trip_shares s
    where s.trip_id = p_trip and s.revoked_at is null
  ), '[]'::jsonb);
end $$;
revoke all on function public.share_follower_stats(uuid) from public, anon;
grant execute on function public.share_follower_stats(uuid) to authenticated;
