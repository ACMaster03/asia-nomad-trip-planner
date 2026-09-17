-- ============================================================================
-- 34-social-interactions.sql — the people you see, and what they can say
-- (2026-09-17). Phase C1/C2/C3 of docs/SOCIAL-SCOPE.md plus the People-page
-- data, as settled in the round-4 mock review.
--
--   * my_followers / remove_follower / block_user / unblock_user / my_blocked
--                     — the Followers tab: who follows you, where they are (only
--                       from trips they themselves opened to followers), and
--                       the per-person removal tools.
--   * my_following    — re-issued from 33 with the country of the current stop,
--                       so the People page can filter "who is in Japan".
--   * reaction_kinds  — a registry of six keys (❤️ 😂 😮 👏 🔥 🥹). Stored keys,
--                       never glyphs: a seventh kind is a row, not a migration.
--   * event_reactions — one reaction per person per post; react() replaces it.
--   * feed_social     — per post: your own reaction, the comment count, and —
--                       ONLY for the trip's travellers — the tally. Followers
--                       never see the tally (decided 2026-09-17, "the tally is
--                       for the travellers only").
--   * event_comments  — account-only writing, readable by everyone who can see
--                       the post (anonymous link holders included). One level
--                       of replies. Soft-deleted, so a thread never gets holes.
--   * comment_reports — a report path from day one, because user-written text
--                       is served to anonymous visitors.
--
-- Every read of reactions and comments goes through a SECURITY DEFINER RPC
-- that checks _can_see_event(); the tables carry RLS with NO policies, so no
-- client reads them directly. _can_see_event() calls can_follow_trip(), and so
-- MUST NEVER appear in a table policy either — same rule, same reason as 33.
--
-- Idempotent, additive-only.
-- Depends on 03 (profiles.is_admin), 06 (can_view_trip/can_edit_trip), 10
-- (trip_events, check_ins), 17 (_share_for_token), 33 (user_follows,
-- user_blocks, follower_access, _traveller_name, _trip_travellers,
-- _followed_travellers, can_follow_trip).
--
-- AUTHORITY NOTE: supersedes 33's my_following() and its user_follows delete
-- policy. Always (re)apply 34 after 33.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) WHO CAN SEE A POST — the one predicate every interaction hangs on.
--    Travellers (any member) see everything; a follower sees follower-visible
--    posts by the travellers they follow, and arrivals; nobody else.
-- ---------------------------------------------------------------------------

create or replace function public._can_see_event(p_event uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_events e
    where e.id = p_event
      and (public.can_view_trip(e.trip_id)
           or (e.visibility in ('followers', 'public')
               and public.can_follow_trip(e.trip_id)
               and (e.kind = 'arrived'
                    or e.author in (select public._followed_travellers(e.trip_id)))))
  );
$$;
revoke all on function public._can_see_event(uuid) from public, anon, authenticated;

-- The anonymous variant: the token is the credential, the post must belong to
-- that trip and be follower-visible, and the link must not be paused.
create or replace function public._token_can_see_event(p_token text, p_event uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public._share_for_token(p_token) s
    join public.trip_events e on e.trip_id = s.trip_id
    where s.id is not null and s.paused_at is null
      and e.id = p_event and e.visibility in ('followers', 'public')
  );
$$;
revoke all on function public._token_can_see_event(text, uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2) FOLLOWERS: the other tab of the People page, and the removal tools.
-- ---------------------------------------------------------------------------

-- The followee may now delete a follow too ("Remove" on the Followers tab).
drop policy if exists user_follows_delete on public.user_follows;
create policy user_follows_delete on public.user_follows for delete
  to authenticated using (follower_id = auth.uid() or followee_id = auth.uid());

-- Where someone is right now, but only if they opened that trip to followers:
-- a person who never shared anything has no visible whereabouts.
create or replace function public._open_location(p_uid uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with today as (select to_char(current_date, 'YYYY-MM-DD') as d)
  select jsonb_build_object(
           'trip_id',  t.id,
           'tripName', t.state->'meta'->>'tripName',
           'city',     seg->>'city',
           'country',  seg->>'country')
  from public.trips t
  join public._trip_travellers(t.id) tr on tr.user_id = p_uid
  cross join today
  cross join lateral (
    select seg from jsonb_array_elements(coalesce(t.state->'segments', '[]'::jsonb)) seg
    where coalesce((seg->>'include')::boolean, true)
      and (seg->>'arrive') <= today.d and today.d < (seg->>'depart')
    order by seg->>'arrive' limit 1
  ) cur
  where t.follower_access = 'on'
  order by t.state->'meta'->>'startDate' desc nulls last
  limit 1;
$$;
revoke all on function public._open_location(uuid) from public, anon, authenticated;

create or replace function public.my_followers()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',    f.follower_id,
    'name',       public._traveller_name(f.follower_id),
    'followedAt', f.created_at,
    'location',   public._open_location(f.follower_id)
  ) order by public._traveller_name(f.follower_id), f.created_at desc), '[]'::jsonb)
  from public.user_follows f
  where f.followee_id = auth.uid()
    and not exists (select 1 from public.user_blocks b
                     where b.blocker_id = auth.uid() and b.blocked_id = f.follower_id);
$$;
revoke all on function public.my_followers() from public, anon;
grant execute on function public.my_followers() to authenticated;

-- Block: they stop following you now, and cannot come back through any link,
-- under this account or a fresh one on the same email.
create or replace function public.block_user(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_user is null or p_user = v_uid then
    raise exception 'cannot block yourself' using errcode = '22023';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = p_user;
  if not exists (select 1 from public.user_blocks b where b.blocker_id = v_uid and b.blocked_id = p_user) then
    insert into public.user_blocks (blocker_id, blocked_id, email) values (v_uid, p_user, v_email);
  end if;
  delete from public.user_follows where follower_id = p_user and followee_id = v_uid;
end $$;
revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user;
end $$;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

create or replace function public.my_blocked()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',   b.blocked_id,
    'name',      public._traveller_name(b.blocked_id),
    'blockedAt', b.created_at
  ) order by b.created_at desc), '[]'::jsonb)
  from public.user_blocks b
  where b.blocker_id = auth.uid() and b.blocked_id is not null;
$$;
revoke all on function public.my_blocked() from public, anon;
grant execute on function public.my_blocked() to authenticated;


-- ---------------------------------------------------------------------------
-- 3) my_following, re-issued with the country of the current stop.
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
  ),
  with_cur as (
    select tr.*,
           (select seg from jsonb_array_elements(coalesce(tr.state->'segments', '[]'::jsonb)) seg, me
             where coalesce((seg->>'include')::boolean, true)
               and (seg->>'arrive') <= me.today and me.today < (seg->>'depart')
             order by seg->>'arrive' limit 1) as cur
    from trips_of tr
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
        'currentCity',    case when tr.follower_access = 'on' then tr.cur->>'city' end,
        'currentCountry', case when tr.follower_access = 'on' then tr.cur->>'country' end,
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
      from with_cur tr where tr.followee_id = p.followee_id
    ), '[]'::jsonb)
  ) order by public._traveller_name(p.followee_id), p.created_at desc), '[]'::jsonb)
  from people p, me
  where me.uid is not null;
$$;
revoke all on function public.my_following() from public, anon;
grant execute on function public.my_following() to authenticated;


-- ---------------------------------------------------------------------------
-- 4) THE COMMENT TABLES — defined before the reaction helpers, which count
--    comments per post (SQL-language functions are checked at creation).
-- ---------------------------------------------------------------------------

create table if not exists public.event_comments (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.trip_events (id) on delete cascade,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  author     uuid not null references auth.users (id) on delete cascade,
  parent_id  uuid references public.event_comments (id) on delete cascade,
  body       text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);
create index if not exists event_comments_event_idx on public.event_comments (event_id, created_at);
alter table public.event_comments enable row level security;   -- no policies: RPCs only

create table if not exists public.comment_reports (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.event_comments (id) on delete cascade,
  reporter   uuid not null references auth.users (id) on delete cascade,
  reason     text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (comment_id, reporter)
);
alter table public.comment_reports enable row level security;
drop policy if exists comment_reports_admin on public.comment_reports;
create policy comment_reports_admin on public.comment_reports for select
  to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));


-- ---------------------------------------------------------------------------
-- 5) REACTIONS
-- ---------------------------------------------------------------------------

create table if not exists public.reaction_kinds (
  key   text primary key,
  glyph text not null,
  label text not null,
  sort  int  not null
);
alter table public.reaction_kinds enable row level security;
drop policy if exists reaction_kinds_read on public.reaction_kinds;
create policy reaction_kinds_read on public.reaction_kinds for select
  to anon, authenticated using (true);
insert into public.reaction_kinds (key, glyph, label, sort) values
  ('heart', '❤️', 'beautiful',   1),
  ('laugh', '😂', 'funny',       2),
  ('wow',   '😮', 'astonishing', 3),
  ('clap',  '👏', 'milestone',   4),
  ('fire',  '🔥', 'the grind',   5),
  ('care',  '🥹', 'affection',   6)
on conflict (key) do update set glyph = excluded.glyph, label = excluded.label, sort = excluded.sort;

create table if not exists public.event_reactions (
  event_id   uuid not null references public.trip_events (id) on delete cascade,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null references public.reaction_kinds (key) on update cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_reactions_trip_idx on public.event_reactions (trip_id);
-- RLS on, no policies: reads and writes only through the RPCs below.
alter table public.event_reactions enable row level security;

-- Set (or clear, with null) the caller's reaction on a post they can see.
create or replace function public.react(p_event uuid, p_kind text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_trip uuid;
begin
  if v_uid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not public._can_see_event(p_event) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind is null then
    delete from public.event_reactions where event_id = p_event and user_id = v_uid;
  else
    if not exists (select 1 from public.reaction_kinds where key = p_kind) then
      raise exception 'unknown reaction kind' using errcode = '22023';
    end if;
    select trip_id into v_trip from public.trip_events where id = p_event;
    insert into public.event_reactions (event_id, trip_id, user_id, kind)
    values (p_event, v_trip, v_uid, p_kind)
    on conflict (event_id, user_id) do update set kind = excluded.kind, created_at = now();
  end if;
  return public.feed_social(array[p_event]) -> 0;
end $$;
revoke all on function public.react(uuid, text) from public, anon;
grant execute on function public.react(uuid, text) to authenticated;

-- Per post, for the caller: their own reaction, the comment count, and the
-- tally when they travel on that trip. Posts the caller cannot see are left
-- out silently. Capped at 100 posts per call (three feed pages).
create or replace function public.feed_social(p_events uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'event_id', e.id,
    'mine', (select r.kind from public.event_reactions r where r.event_id = e.id and r.user_id = auth.uid()),
    'commentCount', (select count(*) from public.event_comments c
                      where c.event_id = e.id and c.deleted_at is null),
    'tally', case when public.can_view_trip(e.trip_id) then coalesce((
      select jsonb_agg(jsonb_build_object('kind', k.key, 'count', k.n) order by k.n desc, k.sort)
      from (select r.kind as key, count(*) as n, min(rk.sort) as sort
              from public.event_reactions r join public.reaction_kinds rk on rk.key = r.kind
             where r.event_id = e.id group by r.kind) k
    ), '[]'::jsonb) end
  ))), '[]'::jsonb)
  from unnest(p_events[1:100]) as u(event_id)
  join public.trip_events e on e.id = u.event_id
  where auth.uid() is not null and public._can_see_event(e.id);
$$;
revoke all on function public.feed_social(uuid[]) from public, anon;
grant execute on function public.feed_social(uuid[]) to authenticated;

-- Who reacted with what: travellers of the trip only.
create or replace function public.event_reactors(p_event uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', r.user_id, 'name', public._traveller_name(r.user_id), 'kind', r.kind
  ) order by r.created_at desc), '[]'::jsonb)
  from public.event_reactions r
  where r.event_id = p_event
    and auth.uid() is not null
    and public.can_view_trip(r.trip_id);
$$;
revoke all on function public.event_reactors(uuid) from public, anon;
grant execute on function public.event_reactors(uuid) to authenticated;

-- Anonymous link holders get comment counts only (they cannot react).
create or replace function public.shared_feed_social(p_token text, p_events uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', u.event_id,
    'commentCount', (select count(*) from public.event_comments c
                      where c.event_id = u.event_id and c.deleted_at is null)
  )), '[]'::jsonb)
  from unnest(p_events[1:100]) as u(event_id)
  where public._token_can_see_event(p_token, u.event_id);
$$;
revoke all on function public.shared_feed_social(text, uuid[]) from public;
grant execute on function public.shared_feed_social(text, uuid[]) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6) COMMENTS
-- ---------------------------------------------------------------------------

-- The thread, flat and ordered: each top-level comment followed by its replies.
-- Deleted comments are dropped unless a live reply still hangs off them, in
-- which case they stay as a placeholder so the reply keeps its context.
create or replace function public._comments_core(p_event uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with c as (
    select c.*,
           coalesce((select p.created_at from public.event_comments p where p.id = c.parent_id), c.created_at) as thread_at,
           exists (select 1 from public.event_comments r where r.parent_id = c.id and r.deleted_at is null) as has_live_replies
    from public.event_comments c
    where c.event_id = p_event
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',         c.id,
    'parent_id',  c.parent_id,
    'author',     case when c.deleted_at is null then c.author end,
    'authorName', case when c.deleted_at is null then public._traveller_name(c.author) end,
    'isTraveller', c.deleted_at is null and exists (select 1 from public._trip_travellers(c.trip_id) t where t.user_id = c.author),
    'body',       case when c.deleted_at is null then c.body else '' end,
    'deleted',    c.deleted_at is not null,
    'created_at', c.created_at
  ) order by c.thread_at, (c.parent_id is not null), c.created_at), '[]'::jsonb)
  from c
  where c.deleted_at is null or c.has_live_replies;
$$;
revoke all on function public._comments_core(uuid) from public, anon, authenticated;

create or replace function public.event_comments_list(p_event uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and public._can_see_event(p_event)
              then public._comments_core(p_event) end;
$$;
revoke all on function public.event_comments_list(uuid) from public, anon;
grant execute on function public.event_comments_list(uuid) to authenticated;

create or replace function public.shared_event_comments(p_token text, p_event uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public._token_can_see_event(p_token, p_event)
              then public._comments_core(p_event) end;
$$;
revoke all on function public.shared_event_comments(text, uuid) from public;
grant execute on function public.shared_event_comments(text, uuid) to anon, authenticated;

create or replace function public.add_comment(p_event uuid, p_body text, p_parent uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_trip uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_id   uuid;
begin
  if v_uid is null or not public._can_see_event(p_event) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'comment must be 1 to 2000 characters' using errcode = '22023';
  end if;
  if p_parent is not null and not exists (
    select 1 from public.event_comments p
     where p.id = p_parent and p.event_id = p_event and p.parent_id is null and p.deleted_at is null) then
    raise exception 'replies go one level deep, under a live top-level comment' using errcode = '22023';
  end if;
  select trip_id into v_trip from public.trip_events where id = p_event;
  insert into public.event_comments (event_id, trip_id, author, parent_id, body)
  values (p_event, v_trip, v_uid, p_parent, v_body)
  returning id into v_id;
  return (select c from jsonb_array_elements(public._comments_core(p_event)) c where (c->>'id')::uuid = v_id);
end $$;
revoke all on function public.add_comment(uuid, text, uuid) from public, anon;
grant execute on function public.add_comment(uuid, text, uuid) to authenticated;

-- Your own comment, or any comment on a trip you edit (moderation). Soft.
create or replace function public.delete_comment(p_comment uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_c   public.event_comments;
begin
  if v_uid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_c from public.event_comments where id = p_comment;
  if v_c.id is null or v_c.deleted_at is not null then return; end if;
  if v_c.author <> v_uid and not public.can_edit_trip(v_c.trip_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.event_comments
     set deleted_at = now(), deleted_by = v_uid, body = ''
   where id = p_comment;
end $$;
revoke all on function public.delete_comment(uuid) from public, anon;
grant execute on function public.delete_comment(uuid) to authenticated;

create or replace function public.report_comment(p_comment uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_event uuid;
begin
  if v_uid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select event_id into v_event from public.event_comments where id = p_comment and deleted_at is null;
  if v_event is null or not public._can_see_event(v_event) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.comment_reports (comment_id, reporter, reason)
  values (p_comment, v_uid, left(btrim(coalesce(p_reason, '')), 500))
  on conflict (comment_id, reporter) do update set reason = excluded.reason, created_at = now();
end $$;
revoke all on function public.report_comment(uuid, text) from public, anon;
grant execute on function public.report_comment(uuid, text) to authenticated;


-- ============================================================================
-- Done. Run 34-TESTPLAN.sql against STAGING before prod. Nothing here changes
-- the anonymous summary or feed projections; anonymous readers gain two new
-- read-only calls (shared_feed_social, shared_event_comments).
-- ============================================================================
