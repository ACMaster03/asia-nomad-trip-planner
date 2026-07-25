-- ============================================================================
-- 18-broadcast-position.sql — M3 last item: followers see check-ins land in
-- about a second instead of waiting out the 45s poll.
--
-- WHY BROADCAST AND NOT POSTGRES CHANGES: followers are anon and every table
-- is closed to them (migration 11), so Postgres Changes has nothing it may
-- legally replicate. Broadcast is a separate pipe with its own authorization.
--
-- THE PAYLOAD IS EMPTY, ON PURPOSE. This is a cache-invalidation ping, not a
-- data channel: it says "something changed", and the follower re-reads through
-- the same sanitized RPC as always. So there is no second projection of trip
-- data to keep in sync or audit, and revoke / pause / expire keep working
-- exactly as they already do — the RPC still refuses, the ping just goes stale.
--
-- The channel is PUBLIC with an unguessable topic (256 bits), the same entropy
-- model already accepted for follow tokens and trip-media paths. A private
-- channel would need realtime.messages RLS, and an anon follower holding only
-- a link has no identity to write a policy against.
--
-- Idempotent, additive-only. Depends on 11 (trip_shares), 16 (paused_at),
-- 10 (trip_events).
-- ============================================================================

alter table public.trip_shares
  add column if not exists broadcast_topic text;
alter table public.trip_shares
  alter column broadcast_topic set default
    (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

update public.trip_shares
   set broadcast_topic = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
 where broadcast_topic is null;

alter table public.trip_shares
  alter column broadcast_topic set not null;

create unique index if not exists trip_shares_broadcast_topic_idx
  on public.trip_shares (broadcast_topic);

-- ---------------------------------------------------------------------------
-- shared_trip_summary: hand the follower their topic. Paused shares keep
-- returning {paused, tripName} only, so a paused link cannot even learn its
-- topic, let alone receive on it.
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
    'tripName',       v_trip.state->'meta'->>'tripName',
    'startDate',      v_trip.state->'meta'->>'startDate',
    'endDate',        v_trip.state->'meta'->>'endDate',
    'broadcastTopic', v_share.broadcast_topic,
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
-- WHY THERE IS NO DATABASE TRIGGER HERE
--
-- The obvious implementation is a trigger calling realtime.send(). It does not
-- work on this project, and fails SILENTLY, which is worse:
--
--   realtime.send() inserts into realtime.messages, which is DAILY PARTITIONED.
--   Both envs have ZERO partitions, so every send raises
--   "WarnSendingBroadcastMessage: no partition of relation messages found" —
--   a WARNING, not an error. The transaction commits, the check-in saves, and
--   the ping evaporates. Verified 2026-07-25 on staging: 0 messages delivered.
--
--   Partitions cannot be provisioned from here either: realtime is owned by
--   supabase_realtime_admin and the postgres role gets "permission denied for
--   schema realtime".
--
-- So the ping is sent CLIENT-SIDE by the traveller's app after a mutation
-- commits, over the same Realtime WebSocket. Measured 884ms end-to-end from an
-- anon sender to an anon receiver on staging.
--
-- Consequence to know about: a public channel means anyone holding the topic
-- could also SEND on it. That is acceptable precisely because the payload is
-- empty — the worst a spoofed ping achieves is making a follower's browser
-- re-read the sanitized RPC it was going to poll anyway. No data rides this
-- channel, so nothing can be forged onto a follower's screen.
--
-- If Supabase ever provisions realtime.messages partitions, revisit: a trigger
-- would additionally cover mutations made outside the app.
-- ---------------------------------------------------------------------------
drop trigger if exists trip_events_broadcast on public.trip_events;
drop function if exists public.broadcast_shared_event();
