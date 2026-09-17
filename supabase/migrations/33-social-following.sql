-- ============================================================================
-- 33-social-following.sql — Phase A of docs/SOCIAL-SCOPE.md (2026-09-16):
-- a signed-in traveller can FOLLOW PEOPLE, and see their journeys next to
-- their own.
--
-- The relationship is person → person (user_follows). The unit of content
-- stays the TRIP: a trip is visible to followers only when its travellers say
-- so (trips.follower_access), and a follower sees that trip's route plus the
-- follower-visible posts of the travellers they actually follow. The share
-- link stays the door for anonymous readers and is where an account converts:
-- "follow Patrik and Anna", all travellers preselected, untick who you like.
--
--   * trips.follower_access — 'off' (default for new trips: a trip is never
--                             broadcast to followers by accident), 'on', or
--                             'paused'. Backfilled to 'on' for trips that
--                             already have a live, unpaused link: those
--                             travellers have already chosen to share.
--   * user_follows          — (follower, followee). via_share_id is provenance
--                             only; pausing or revoking that link changes
--                             nothing about the follow.
--   * user_blocks           — the followee's per-person removal tool. Written
--                             by Phase C; CHECKED from day one.
--   * can_follow_trip()     — the follower predicate. ⚠ SEE THE WARNING BELOW.
--   * follow_by_token       — the ONLY place a raw token is hashed on the
--                             account path. Dead, paused, blocked: same null.
--   * my_following          — everyone you follow, with their visible trips,
--                             in ONE call.
--   * followed_trip_summary / following_feed
--                           — authenticated twins of shared_trip_summary and
--                             shared_feed, built on ONE shared projection core
--                             so the two can never drift.
--   * set_follower_access, my_follower_count — the traveller's side.
--
-- ⚠ THE LOAD-BEARING RULE — can_follow_trip() MUST NEVER APPEAR IN A TABLE
-- RLS POLICY. It authorises the sanitized follower RPCs below and nothing
-- else. can_view_trip() gates segments, stays, transport, extras, notes,
-- ledger, trip_events and check_ins (06 + 10). One "for consistency" edit that
-- adds can_follow_trip to any of those policies hands every follower the
-- addresses, booking refs and cash position of the trip. To make that edit
-- fail loudly rather than silently, EXECUTE on can_follow_trip is revoked
-- from `authenticated`: a policy that calls it raises for every end user on
-- first use. 33-TESTPLAN.sql asserts the predicate is absent from pg_policies.
--
-- Names: the follower projection shows a traveller's FIRST NAME from the auth
-- metadata (what the Account "Your name" card writes) and otherwise
-- "A traveller". It never falls back to profiles.display_name, which
-- handle_new_user() seeds from the email's local part.
--
-- "Arrived in X" events belong to the trip, not to a traveller: they show to
-- anyone following ANY traveller on that trip. Check-ins and notes are
-- filtered by author.
--
-- Idempotent, additive-only.
-- Depends on 02 (trip_members), 06 (can_view_trip/can_edit_trip), 10
-- (trip_events, check_ins), 11 (trip_shares, create_share_link), 16
-- (paused_at, set_trip_sharing_paused), 17 (_share_for_token v2), 18
-- (broadcast_topic).
--
-- AUTHORITY NOTE: this file supersedes 18's shared_trip_summary(), 16's
-- shared_feed() and 16's set_trip_sharing_paused(). The first two are now thin
-- wrappers over the cores defined here (TESTPLAN block 6 proves the follower
-- projection matches); the third additionally flips follower_access between
-- 'on' and 'paused'. Re-running 16 or 18 afterwards restores the old copies —
-- always (re)apply 33 after 16 and 18.
--
-- Phase C note: user_blocks.email rows are the blocker's record, not the
-- blocked account's data. delete_my_account() (29) does not clear them on
-- purpose — the column exists precisely to survive a re-signup.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) TABLES AND THE TRIP SWITCH
-- ---------------------------------------------------------------------------

alter table public.trips
  add column if not exists follower_access text not null default 'off';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trips_follower_access_check') then
    alter table public.trips
      add constraint trips_follower_access_check
      check (follower_access in ('off', 'on', 'paused'));
  end if;
end $$;

-- Travellers who already hand out live links have already decided to share
-- this trip. Only ever runs on rows still at the default.
update public.trips t
   set follower_access = 'on'
 where t.follower_access = 'off'
   and exists (select 1 from public.trip_shares s
                where s.trip_id = t.id and s.revoked_at is null and s.paused_at is null
                  and (s.expires_at is null or s.expires_at > now()));

create table if not exists public.user_follows (
  follower_id  uuid not null references auth.users (id) on delete cascade,
  followee_id  uuid not null references auth.users (id) on delete cascade,
  via_share_id uuid references public.trip_shares (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists user_follows_followee_idx on public.user_follows (followee_id);

create table if not exists public.user_blocks (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now(),
  check (blocked_id is not null or email is not null)
);
create index if not exists user_blocks_blocker_idx on public.user_blocks (blocker_id);

-- following_feed scans several trips at once; the partial index skips every
-- private row without touching it.
create index if not exists trip_events_follower_feed_idx
  on public.trip_events (trip_id, occurred_at desc)
  where visibility in ('followers', 'public');


-- ---------------------------------------------------------------------------
-- 2) RLS
--
-- user_follows: you see the rows you are on either end of — your own follows,
-- and the people following you (Phase C's block list needs that). You delete
-- only your own follows (unfollow). No INSERT policy on purpose: rows are
-- minted only by follow_by_token(), the way trip_shares rows are minted only
-- by create_share_link(). No UPDATE: there is nothing to edit.
--
-- user_blocks: the blocker's list, nobody else's.
-- ---------------------------------------------------------------------------

alter table public.user_follows enable row level security;
alter table public.user_blocks  enable row level security;

drop policy if exists user_follows_select on public.user_follows;
create policy user_follows_select on public.user_follows for select
  to authenticated using (follower_id = auth.uid() or followee_id = auth.uid());

drop policy if exists user_follows_delete on public.user_follows;
create policy user_follows_delete on public.user_follows for delete
  to authenticated using (follower_id = auth.uid());

drop policy if exists user_blocks_all on public.user_blocks;
create policy user_blocks_all on public.user_blocks for all
  to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 3) INTERNAL HELPERS — callable only from the definer functions below.
-- ---------------------------------------------------------------------------

-- First name from the auth metadata, else "A traveller". Never the profile
-- display name (see header).
create or replace function public._traveller_name(p_uid uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
           nullif(btrim(u.raw_user_meta_data->>'first_name'), ''),
           'A traveller')
  from auth.users u where u.id = p_uid;
$$;
revoke all on function public._traveller_name(uuid) from public, anon, authenticated;

-- The people who travel: the owner and the editors. Viewers read, they do
-- not post, and following one of them would mean nothing.
create or replace function public._trip_travellers(p_trip uuid)
returns table (user_id uuid, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select t.owner, true from public.trips t where t.id = p_trip
  union
  select m.user_id, false from public.trip_members m
   where m.trip_id = p_trip and m.role = 'editor'
     and m.user_id <> (select owner from public.trips where id = p_trip);
$$;
revoke all on function public._trip_travellers(uuid) from public, anon, authenticated;

-- Which of a trip's travellers the caller follows and is not blocked by.
create or replace function public._followed_travellers(p_trip uuid)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select tr.user_id
  from public._trip_travellers(p_trip) tr
  join public.user_follows f on f.followee_id = tr.user_id and f.follower_id = auth.uid()
  where not exists (select 1 from public.user_blocks b
                     where b.blocker_id = tr.user_id and b.blocked_id = auth.uid());
$$;
revoke all on function public._followed_travellers(uuid) from public, anon, authenticated;

-- Everyone the caller follows who has not blocked them.
create or replace function public._my_followees()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select f.followee_id
  from public.user_follows f
  where f.follower_id = auth.uid()
    and not exists (select 1 from public.user_blocks b
                     where b.blocker_id = f.followee_id and b.blocked_id = auth.uid());
$$;
revoke all on function public._my_followees() from public, anon, authenticated;

create or replace function public.can_follow_trip(t uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.trips x where x.id = t and x.follower_access <> 'off')
     and exists (select 1 from public._followed_travellers(t));
$$;
-- Revoked from authenticated ON PURPOSE (see the header): this is the tripwire.
revoke all on function public.can_follow_trip(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4) THE SHARED PROJECTION CORES
--
-- Exactly what anonymous followers see, extracted so the authenticated twins
-- cannot grow a wider projection by accident. New since 16/18, for both
-- audiences: the travellers' first names on the summary, and the author's
-- id + first name on each feed row. Nothing here checks authorisation; the
-- wrappers do.
-- ---------------------------------------------------------------------------

create or replace function public._trip_summary_core(p_trip uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tripName',  t.state->'meta'->>'tripName',
    'startDate', t.state->'meta'->>'startDate',
    'endDate',   t.state->'meta'->>'endDate',
    'route', coalesce((
      select jsonb_agg(jsonb_build_object(
               'city',    seg->>'city',
               'country', seg->>'country',
               'arrive',  seg->>'arrive',
               'depart',  seg->>'depart',
               'lat',     c.lat,
               'lng',     c.lng
             ) order by seg->>'arrive')
      from jsonb_array_elements(coalesce(t.state->'segments', '[]'::jsonb)) seg
      left join public.cities c on c.city = seg->>'city'
      where coalesce((seg->>'include')::boolean, true)
    ), '[]'::jsonb),
    'travellers', coalesce((
      select jsonb_agg(jsonb_build_object('id', tr.user_id, 'name', public._traveller_name(tr.user_id))
                       order by tr.is_owner desc, public._traveller_name(tr.user_id), tr.user_id)
      from public._trip_travellers(t.id) tr
    ), '[]'::jsonb)
  )
  from public.trips t
  where t.id = p_trip;
$$;
revoke all on function public._trip_summary_core(uuid) from public, anon, authenticated;

-- p_authors null = every traveller (the anonymous page). Otherwise check-ins
-- and notes are limited to those authors; 'arrived' rows always pass.
create or replace function public._trip_feed_core(
  p_trips uuid[], p_authors uuid[], p_before timestamptz, p_limit int)
returns table (trip_id uuid, occurred_at timestamptz, row_ev jsonb)
language sql stable security definer set search_path = public as $$
  select e.trip_id,
         e.occurred_at,
         jsonb_build_object(
           'id', e.id,
           'kind', e.kind,
           'occurred_at', e.occurred_at,
           'author', e.author,
           'authorName', public._traveller_name(e.author),
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
         )
  from public.trip_events e
  left join public.check_ins ci on ci.event_id = e.id
  where e.trip_id = any (p_trips)
    and e.visibility in ('followers', 'public')
    and (p_authors is null or e.kind = 'arrived' or e.author = any (p_authors))
    and (p_before is null or e.occurred_at < p_before)
  order by e.occurred_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;
revoke all on function public._trip_feed_core(uuid[], uuid[], timestamptz, int) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5) THE ANONYMOUS FUNCTIONS, NOW AS WRAPPERS (same signatures)
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
  return public._trip_summary_core(v_trip.id)
      || jsonb_build_object('broadcastTopic', v_share.broadcast_topic);
end $$;
revoke all on function public.shared_trip_summary(text) from public;
grant execute on function public.shared_trip_summary(text) to anon, authenticated;

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
    select jsonb_agg(c.row_ev order by c.occurred_at desc)
    from public._trip_feed_core(array[v_share.trip_id], null, p_before, p_limit) c
  ), '[]'::jsonb);
end $$;
revoke all on function public.shared_feed(text, timestamptz, int) from public;
grant execute on function public.shared_feed(text, timestamptz, int) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6) follow_by_token — walking through the door.
--
-- p_travellers null = everyone on the trip (the preselected default);
-- otherwise only the listed ids, silently intersected with the trip's actual
-- travellers. The caller is never added as their own followee. Anyone who has
-- blocked the caller (by id, or by the caller's real email — read from
-- auth.users, never from the JWT) is skipped without a trace. Dead, expired
-- or paused link, or nobody left to follow: the same null in every case.
-- Re-following is idempotent.
-- ---------------------------------------------------------------------------

create or replace function public.follow_by_token(p_token text, p_travellers uuid[] default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_share public.trip_shares;
  v_email text;
  v_ids   uuid[];
begin
  if v_uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_share := public._share_for_token(p_token);
  if v_share.id is null or v_share.paused_at is not null then
    return null;
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  select coalesce(array_agg(tr.user_id), '{}'::uuid[]) into v_ids
  from public._trip_travellers(v_share.trip_id) tr
  where tr.user_id <> v_uid
    and (p_travellers is null or tr.user_id = any (p_travellers))
    and not exists (
      select 1 from public.user_blocks b
       where b.blocker_id = tr.user_id
         and (b.blocked_id = v_uid
              or (b.email is not null and v_email is not null and lower(b.email) = v_email)));
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return null;
  end if;

  insert into public.user_follows (follower_id, followee_id, via_share_id)
  select v_uid, id, v_share.id from unnest(v_ids) as id
  on conflict (follower_id, followee_id) do nothing;

  return jsonb_build_object(
    'trip_id',  v_share.trip_id,
    'tripName', (select t.state->'meta'->>'tripName' from public.trips t where t.id = v_share.trip_id),
    'followed', (select jsonb_agg(jsonb_build_object('id', id, 'name', public._traveller_name(id))
                                  order by public._traveller_name(id), id)
                 from unnest(v_ids) as id)
  );
end $$;
revoke all on function public.follow_by_token(text, uuid[]) from public, anon;
grant execute on function public.follow_by_token(text, uuid[]) to authenticated;


-- ---------------------------------------------------------------------------
-- 7) my_following — the people list, one round trip.
--
-- Each followee comes with the trips they travel on that are open to
-- followers ('on' or 'paused'), newest first. Trips the caller is a member of
-- are left out: those are already on Home through the authenticated path.
-- currentCity / lastEventAt / lastSeenCity are null unless the trip is 'on':
-- a paused trip goes dark in the list, not just on its page. "Today" is the
-- database's date (UTC).
-- ---------------------------------------------------------------------------

create or replace function public.my_following()
returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid, to_char(current_date, 'YYYY-MM-DD') as today),
  people as (
    select f.followee_id, f.created_at
    from public.user_follows f, me
    where f.follower_id = me.uid
      and not exists (select 1 from public.user_blocks b
                       where b.blocker_id = f.followee_id and b.blocked_id = me.uid)
  ),
  trips_of as (
    select p.followee_id, t.id as trip_id, t.follower_access, t.state
    from people p
    join lateral (
      select x.* from public.trips x
      where x.follower_access <> 'off'
        and not public.can_view_trip(x.id)
        and exists (select 1 from public._trip_travellers(x.id) tr where tr.user_id = p.followee_id)
    ) t on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',    p.followee_id,
    'name',       public._traveller_name(p.followee_id),
    'followedAt', p.created_at,
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'trip_id',   tr.trip_id,
        'tripName',  tr.state->'meta'->>'tripName',
        'startDate', tr.state->'meta'->>'startDate',
        'endDate',   tr.state->'meta'->>'endDate',
        'state',     tr.follower_access,
        'travellers', (select jsonb_agg(jsonb_build_object('id', x.user_id, 'name', public._traveller_name(x.user_id))
                                        order by x.is_owner desc, public._traveller_name(x.user_id), x.user_id)
                       from public._trip_travellers(tr.trip_id) x),
        'currentCity', case when tr.follower_access = 'on' then (
          select seg->>'city'
          from jsonb_array_elements(coalesce(tr.state->'segments', '[]'::jsonb)) seg, me
          where coalesce((seg->>'include')::boolean, true)
            and (seg->>'arrive') <= me.today and me.today < (seg->>'depart')
          order by seg->>'arrive'
          limit 1) end,
        'lastEventAt', case when tr.follower_access = 'on' then (
          select max(e.occurred_at) from public.trip_events e
          where e.trip_id = tr.trip_id and e.visibility in ('followers', 'public')
            and (e.author = p.followee_id or e.kind = 'arrived')) end,
        'lastSeenCity', case when tr.follower_access = 'on' then (
          select e.payload->>'city' from public.trip_events e
          where e.trip_id = tr.trip_id and e.kind = 'arrived'
            and e.visibility in ('followers', 'public')
          order by e.occurred_at desc
          limit 1) end
      ) order by tr.state->'meta'->>'startDate' desc nulls last, tr.trip_id)
      from trips_of tr where tr.followee_id = p.followee_id
    ), '[]'::jsonb)
  ) order by public._traveller_name(p.followee_id), p.created_at desc), '[]'::jsonb)
  from people p, me
  where me.uid is not null;
$$;
revoke all on function public.my_following() from public, anon;
grant execute on function public.my_following() to authenticated;


-- ---------------------------------------------------------------------------
-- 8) followed_trip_summary / following_feed — the authenticated twins.
--
-- The summary is null when the caller follows nobody on the trip (or is
-- blocked by everyone they follow there), {paused:true} while the trip is
-- paused, and otherwise the shared core plus `following` (which travellers'
-- posts the caller will see) and one live link's broadcast topic for the
-- realtime nudge (null when the trip has no link — the page then polls).
--
-- The feed deliberately does NOT union the caller's own trips: own events come
-- through the authenticated path with full payloads and private 'trip' notes;
-- these come through the sanitized core. Merging happens on the client.
-- ---------------------------------------------------------------------------

create or replace function public.followed_trip_summary(p_trip uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_access text;
  v_name   text;
begin
  if not public.can_follow_trip(p_trip) then return null; end if;
  select t.follower_access, t.state->'meta'->>'tripName' into v_access, v_name
    from public.trips t where t.id = p_trip;
  if v_access = 'paused' then
    return jsonb_build_object('paused', true, 'tripName', v_name);
  end if;
  return public._trip_summary_core(p_trip)
      || jsonb_build_object(
           'following', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb)
                         from public._followed_travellers(p_trip) id),
           'broadcastTopic', (
             select s.broadcast_topic from public.trip_shares s
              where s.trip_id = p_trip and s.revoked_at is null and s.paused_at is null
                and (s.expires_at is null or s.expires_at > now())
              order by s.created_at
              limit 1));
end $$;
revoke all on function public.followed_trip_summary(uuid) from public, anon;
grant execute on function public.followed_trip_summary(uuid) to authenticated;

create or replace function public.following_feed(
  p_limit int default 30, p_before timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_trips   uuid[];
  v_authors uuid[];
begin
  if auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_authors from public._my_followees() id;
  if coalesce(array_length(v_authors, 1), 0) = 0 then return '[]'::jsonb; end if;
  select coalesce(array_agg(t.id), '{}'::uuid[]) into v_trips
  from public.trips t
  where t.follower_access = 'on'
    and not public.can_view_trip(t.id)
    and exists (select 1 from public._trip_travellers(t.id) tr where tr.user_id = any (v_authors));
  if coalesce(array_length(v_trips, 1), 0) = 0 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(
             c.row_ev || jsonb_build_object(
               'trip_id',  c.trip_id,
               'tripName', t.state->'meta'->>'tripName')
             order by c.occurred_at desc)
    from public._trip_feed_core(v_trips, v_authors, p_before, p_limit) c
    join public.trips t on t.id = c.trip_id
  ), '[]'::jsonb);
end $$;
revoke all on function public.following_feed(int, timestamptz) from public, anon;
grant execute on function public.following_feed(int, timestamptz) to authenticated;


-- ---------------------------------------------------------------------------
-- 9) THE TRAVELLER'S SIDE
--
-- set_follower_access: the per-trip switch. set_trip_sharing_paused (16) is
-- the owner's "pause everything" switch, so it now also flips this between
-- 'on' and 'paused' — never touching 'off'.
-- my_follower_count: how many accounts follow the caller (the Follow-links
-- card's "N signed in"). Who they are is Phase C's list.
-- ---------------------------------------------------------------------------

create or replace function public.set_follower_access(p_trip uuid, p_access text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_edit_trip(p_trip) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_access not in ('off', 'on', 'paused') then
    raise exception 'follower_access must be off, on or paused' using errcode = '22023';
  end if;
  update public.trips set follower_access = p_access where id = p_trip;
end $$;
revoke all on function public.set_follower_access(uuid, text) from public, anon;
grant execute on function public.set_follower_access(uuid, text) to authenticated;

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
  update public.trips
     set follower_access = case
           when p_paused and follower_access = 'on' then 'paused'
           when not p_paused and follower_access = 'paused' then 'on'
           else follower_access end
   where id = p_trip;
end $$;
revoke all on function public.set_trip_sharing_paused(uuid, boolean) from public, anon;
grant execute on function public.set_trip_sharing_paused(uuid, boolean) to authenticated;

create or replace function public.my_follower_count()
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.user_follows f
   where f.followee_id = auth.uid()
     and not exists (select 1 from public.user_blocks b
                      where b.blocker_id = auth.uid() and b.blocked_id = f.follower_id);
$$;
revoke all on function public.my_follower_count() from public, anon;
grant execute on function public.my_follower_count() to authenticated;


-- ============================================================================
-- Done. Run 33-TESTPLAN.sql against STAGING before prod. Safe to apply while
-- the trip is live: the anonymous RPCs keep their signatures; their output
-- gains `travellers` (first names) on the summary and `author`/`authorName`
-- on feed rows, and nothing else moves. No policy on an existing table
-- changes. Deploy the app in the same window so the follow page can show
-- the new names.
-- ============================================================================
