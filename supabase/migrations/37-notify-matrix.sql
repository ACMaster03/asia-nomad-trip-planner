-- ============================================================================
-- 37-notify-matrix.sql — per-person, per-type notification preferences and a
-- per-trip mute (issue #13, Phase C4).
--
-- Until now: two global booleans on profiles (27). Once an account follows
-- several trips that carry comments and reactions, two booleans cannot say
-- "buzz me when a friend posts, never for a heart". This adds:
--
--   notify_prefs   one row per person, missing row = defaults. The matrix:
--                    deadline_push      stay deadlines (was profiles.notify_deadline_push)
--                    own_trip_posts     co-travellers' check-ins on MY trips (was notify_event_push)
--                    follow_posts       new posts by people I follow          (default on)
--                    comments_on_mine   comments on MY posts                  (default on)
--                    replies            replies to MY comments, anywhere      (default on)
--                    reactions          reactions on MY posts                 (default OFF)
--   trip_notify    one row per (person, trip): muted (overrides everything
--                  for that trip) and all_comments (widen "comments on my
--                  posts" to every post of that trip — travellers only).
--
-- "Reply to my comment" follows the PERSON, not the trip: one channel across
-- both columns of the matrix, which is what keeps this from multiplying out
-- per followed trip.
--
-- Routing moves INTO the database: three push_audience_* readers compute
-- who gets a push for an event, a comment or a reaction, with every rule
-- above applied, and hand the Edge Function a finished list plus the copy it
-- needs. The function only looks up devices and sends. That makes the rules
-- testable here (37-TESTPLAN) instead of inside a Deno function nobody runs
-- locally. They are callable by service_role only.
--
-- The two profiles booleans stay in place and are MIRRORED from notify_prefs
-- by trigger, so stay-deadline-alerts and any not-yet-redeployed copy of
-- push-fanout keep reading correct values. Existing non-default settings
-- are carried over.
--
-- Triggers: event_comments and event_reactions now poke push-fanout like
-- trip_events does (13 → 27 → 30), through one shared poster.
--
-- Idempotent, additive-only. Depends on 27 (profiles booleans,
-- user_push_subscriptions), 30 (signed fan-out headers), 33 (follows,
-- blocks, _trip_travellers, _traveller_name), 34 (comments, reactions).
-- Deploy the updated push-fanout Edge Function after applying.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Preferences
-- ---------------------------------------------------------------------------

create table if not exists public.notify_prefs (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  deadline_push    boolean not null default true,
  own_trip_posts   boolean not null default true,
  follow_posts     boolean not null default true,
  comments_on_mine boolean not null default true,
  replies          boolean not null default true,
  reactions        boolean not null default false,
  updated_at       timestamptz not null default now()
);
alter table public.notify_prefs enable row level security;

drop policy if exists notify_prefs_select on public.notify_prefs;
create policy notify_prefs_select on public.notify_prefs for select
  to authenticated using (user_id = auth.uid());
drop policy if exists notify_prefs_insert on public.notify_prefs;
create policy notify_prefs_insert on public.notify_prefs for insert
  to authenticated with check (user_id = auth.uid());
drop policy if exists notify_prefs_update on public.notify_prefs;
create policy notify_prefs_update on public.notify_prefs for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notify_prefs_delete on public.notify_prefs;
create policy notify_prefs_delete on public.notify_prefs for delete
  to authenticated using (user_id = auth.uid());

-- Carry over anyone who switched something off under 27. Everyone else is
-- the default row, which is no row.
insert into public.notify_prefs (user_id, deadline_push, own_trip_posts)
select p.id, p.notify_deadline_push, p.notify_event_push
from public.profiles p
where (p.notify_deadline_push = false or p.notify_event_push = false)
on conflict (user_id) do nothing;

-- Mirror back onto profiles so the functions that still read 27's booleans
-- stay right. Definer: the row is the user's own, but the trigger must not
-- depend on the profiles policies of whoever fires it.
create or replace function public.notify_prefs_mirror()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  update public.profiles
     set notify_deadline_push = new.deadline_push,
         notify_event_push    = new.own_trip_posts
   where id = new.user_id
     and (notify_deadline_push is distinct from new.deadline_push
          or notify_event_push is distinct from new.own_trip_posts);
  return new;
end $$;
drop trigger if exists notify_prefs_mirror on public.notify_prefs;
create trigger notify_prefs_mirror
  before insert or update on public.notify_prefs
  for each row execute function public.notify_prefs_mirror();


create table if not exists public.trip_notify (
  user_id      uuid not null references auth.users (id) on delete cascade,
  trip_id      uuid not null references public.trips (id) on delete cascade,
  muted        boolean not null default false,
  all_comments boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (user_id, trip_id)
);
alter table public.trip_notify enable row level security;

-- Owner-only, all verbs. A row for a trip you cannot see is harmless: it
-- gates pushes you would never receive anyway.
drop policy if exists trip_notify_all on public.trip_notify;
create policy trip_notify_all on public.trip_notify for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 2) Internal predicates
-- ---------------------------------------------------------------------------

-- One preference, with its default when the person never touched anything.
create or replace function public._notify_pref(p_uid uuid, p_key text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case p_key
           when 'deadline_push'    then coalesce(n.deadline_push,    true)
           when 'own_trip_posts'   then coalesce(n.own_trip_posts,   true)
           when 'follow_posts'     then coalesce(n.follow_posts,     true)
           when 'comments_on_mine' then coalesce(n.comments_on_mine, true)
           when 'replies'          then coalesce(n.replies,          true)
           when 'reactions'        then coalesce(n.reactions,        false)
           else false
         end
  from (select 1) x
  left join public.notify_prefs n on n.user_id = p_uid;
$$;
revoke all on function public._notify_pref(uuid, text) from public, anon, authenticated;

create or replace function public._trip_muted(p_uid uuid, p_trip uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_notify n
                  where n.user_id = p_uid and n.trip_id = p_trip and n.muted);
$$;
revoke all on function public._trip_muted(uuid, uuid) from public, anon, authenticated;

-- Everyone on a trip's roster — owner and members of any role. Viewers hear
-- about the trip too: 27 already pushed to them, and reading is why they are
-- on it.
create or replace function public._trip_roster(p_trip uuid)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select t.owner from public.trips t where t.id = p_trip
  union
  select m.user_id from public.trip_members m where m.trip_id = p_trip;
$$;
revoke all on function public._trip_roster(uuid) from public, anon, authenticated;

-- _can_see_event (34) for a NAMED person rather than auth.uid(): the fan-out
-- runs as service_role and asks on everyone's behalf. Same rule: the roster
-- sees everything; a follower sees follower-visible posts by the travellers
-- they follow (arrivals from any traveller), only while the trip is open to
-- followers and they are not blocked.
create or replace function public._user_can_see_event(p_uid uuid, p_event uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.trip_events e
    join public.trips t on t.id = e.trip_id
    where e.id = p_event
      and (p_uid in (select public._trip_roster(e.trip_id))
           or (e.visibility in ('followers', 'public')
               and t.follower_access = 'on'
               and exists (
                 select 1
                 from public.user_follows f
                 join public._trip_travellers(e.trip_id) tr on tr.user_id = f.followee_id
                 where f.follower_id = p_uid
                   and (e.kind = 'arrived' or f.followee_id = e.author)
                   and not exists (select 1 from public.user_blocks b
                                    where b.blocker_id = f.followee_id and b.blocked_id = p_uid))))
  );
$$;
revoke all on function public._user_can_see_event(uuid, uuid) from public, anon, authenticated;

-- What a push calls the post.
create or replace function public._event_title(e public.trip_events)
returns text
language sql immutable as $$
  select case e.kind
           when 'checkin' then coalesce(nullif(e.payload->>'placeName', ''), 'a check-in')
           when 'arrived' then 'Arrived in ' || coalesce(nullif(e.payload->>'city', ''), '…')
           when 'note'    then coalesce(nullif(left(e.payload->>'text', 60), ''), 'a note')
           else 'an update'
         end;
$$;
revoke all on function public._event_title(public.trip_events) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3) Audiences — who gets a push, and the copy to build it from.
--    service_role only. null when the row does not exist.
-- ---------------------------------------------------------------------------

-- A new post. Two account audiences:
--   'trip'   the roster minus the author, every visibility, own_trip_posts on
--   'follow' followers of the author (of any traveller, for an arrival) when
--            the post is follower-visible and the trip is open to followers;
--            follow_posts on; never someone who is on the roster (they are
--            audience 'trip'); never someone the traveller blocked
-- Both minus anyone who muted the trip. Anonymous link devices are not here:
-- the Edge Function keeps handling push_subscriptions by share, as before.
create or replace function public.push_audience_event(p_event uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with e as (
    select e as ev, e.id, e.trip_id, e.author, e.kind, e.visibility,
           t.follower_access, t.state->'meta'->>'tripName' as trip_name
    from public.trip_events e
    join public.trips t on t.id = e.trip_id
    where e.id = p_event
  ),
  roster as (
    select r as user_id from e, public._trip_roster(e.trip_id) r
  ),
  trip_targets as (
    select r.user_id, 'trip'::text as reason
    from roster r, e
    where r.user_id is distinct from e.author
      and public._notify_pref(r.user_id, 'own_trip_posts')
      and not public._trip_muted(r.user_id, e.trip_id)
  ),
  follow_targets as (
    select distinct f.follower_id as user_id, 'follow'::text as reason
    from e
    join public._trip_travellers(e.trip_id) tr on (e.kind = 'arrived' or tr.user_id = e.author)
    join public.user_follows f on f.followee_id = tr.user_id
    where e.visibility in ('followers', 'public')
      and e.follower_access = 'on'
      and f.follower_id not in (select user_id from roster)
      and not exists (select 1 from public.user_blocks b
                       where b.blocker_id = tr.user_id and b.blocked_id = f.follower_id)
      and public._notify_pref(f.follower_id, 'follow_posts')
      and not public._trip_muted(f.follower_id, e.trip_id)
  )
  select jsonb_build_object(
    'event_id',   e.id,
    'trip_id',    e.trip_id,
    'tripName',   coalesce(e.trip_name, 'Trip update'),
    'authorName', public._traveller_name(e.author),
    'kind',       e.kind,
    'visibility', e.visibility,
    'title',      public._event_title(e.ev),
    'rating',     ci.rating,
    'comment',    ci.comment,
    'targets',    coalesce((
      select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'reason', x.reason) order by x.reason, x.user_id)
      from (select * from trip_targets union all select * from follow_targets) x
    ), '[]'::jsonb)
  )
  from e
  left join public.check_ins ci on ci.event_id = e.id;
$$;
revoke all on function public.push_audience_event(uuid) from public, anon, authenticated;
grant execute on function public.push_audience_event(uuid) to service_role;

-- A new comment. Reasons, one per person (reply wins over comment):
--   'reply'   the parent comment's author — replies on, can still see the post
--   'comment' the post's author (comments_on_mine on), and anyone on the
--             roster who widened this trip to all_comments
-- Never the commenter; never a follower for someone else's comment (the
-- matrix says followers hear about posts, not about threads); minus mutes.
create or replace function public.push_audience_comment(p_comment uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with c as (
    select c.id, c.event_id, c.trip_id, c.author, c.parent_id, c.body,
           e.author as post_author, public._event_title(e) as post_title,
           t.state->'meta'->>'tripName' as trip_name,
           (select p.author from public.event_comments p where p.id = c.parent_id) as parent_author
    from public.event_comments c
    join public.trip_events e on e.id = c.event_id
    join public.trips t on t.id = c.trip_id
    where c.id = p_comment and c.deleted_at is null
  ),
  candidates as (
    select c.parent_author as user_id, 'reply'::text as reason from c
    where c.parent_author is not null and c.parent_author <> c.author
      and public._notify_pref(c.parent_author, 'replies')
    union all
    select c.post_author, 'comment' from c
    where c.post_author is not null and c.post_author <> c.author
      and public._notify_pref(c.post_author, 'comments_on_mine')
    union all
    select r, 'comment' from c, public._trip_roster(c.trip_id) r
    where r <> c.author
      and exists (select 1 from public.trip_notify n
                   where n.user_id = r and n.trip_id = c.trip_id and n.all_comments)
  ),
  targets as (
    select distinct on (x.user_id) x.user_id, x.reason
    from candidates x, c
    where not public._trip_muted(x.user_id, c.trip_id)
      and public._user_can_see_event(x.user_id, c.event_id)
    order by x.user_id, (x.reason = 'reply') desc
  )
  select jsonb_build_object(
    'event_id',   c.event_id,
    'trip_id',    c.trip_id,
    'tripName',   coalesce(c.trip_name, 'Trip update'),
    'authorName', public._traveller_name(c.author),
    'body',       left(c.body, 140),
    'title',      c.post_title,
    'targets',    coalesce((
      select jsonb_agg(jsonb_build_object('user_id', t.user_id, 'reason', t.reason) order by t.reason, t.user_id)
      from targets t
    ), '[]'::jsonb)
  )
  from c;
$$;
revoke all on function public.push_audience_comment(uuid) from public, anon, authenticated;
grant execute on function public.push_audience_comment(uuid) to service_role;

-- A new reaction: the post's author, only if they opted IN (reactions is the
-- one preference that defaults off), minus mute. Never the reactor.
create or replace function public.push_audience_reaction(p_event uuid, p_user uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event_id',   e.id,
    'trip_id',    e.trip_id,
    'tripName',   coalesce(t.state->'meta'->>'tripName', 'Trip update'),
    'authorName', public._traveller_name(r.user_id),
    'glyph',      k.glyph,
    'title',      public._event_title(e),
    'targets',    case
      when e.author is not null and e.author <> r.user_id
           and public._notify_pref(e.author, 'reactions')
           and not public._trip_muted(e.author, e.trip_id)
      then jsonb_build_array(jsonb_build_object('user_id', e.author, 'reason', 'reaction'))
      else '[]'::jsonb end
  )
  from public.event_reactions r
  join public.reaction_kinds k on k.key = r.kind
  join public.trip_events e on e.id = r.event_id
  join public.trips t on t.id = e.trip_id
  where r.event_id = p_event and r.user_id = p_user;
$$;
revoke all on function public.push_audience_reaction(uuid, uuid) from public, anon, authenticated;
grant execute on function public.push_audience_reaction(uuid, uuid) to service_role;


-- ---------------------------------------------------------------------------
-- 4) Fan-out triggers. One poster (30's signed headers), three callers.
--    Missing config (a fresh dev database) skips silently, as 13 did.
-- ---------------------------------------------------------------------------

-- search_path includes extensions: that is where Supabase installs pgcrypto,
-- so hmac() resolves. (30 pinned public alone, which only works while
-- app_config is empty — the branch never ran. Fixed here, same body.)
create or replace function public._push_fanout_post(p_body jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
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
      body    := p_body
    );
  end if;
end $$;
revoke all on function public._push_fanout_post(jsonb) from public, anon, authenticated;

-- trip_events (trigger trip_events_push_fanout from 13 keeps pointing here).
create or replace function public.notify_push_fanout()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._push_fanout_post(jsonb_build_object('event_id', new.id));
  return null;
end $$;

create or replace function public.notify_comment_fanout()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._push_fanout_post(jsonb_build_object('comment_id', new.id));
  return null;
end $$;
drop trigger if exists event_comments_push_fanout on public.event_comments;
create trigger event_comments_push_fanout
  after insert on public.event_comments
  for each row execute function public.notify_comment_fanout();

-- Insert only: react() upserts, and changing a heart to a clap is not news.
create or replace function public.notify_reaction_fanout()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._push_fanout_post(jsonb_build_object(
    'reaction', jsonb_build_object('event_id', new.event_id, 'user_id', new.user_id)));
  return null;
end $$;
drop trigger if exists event_reactions_push_fanout on public.event_reactions;
create trigger event_reactions_push_fanout
  after insert on public.event_reactions
  for each row execute function public.notify_reaction_fanout();

-- ============================================================================
-- Done. Run 37-TESTPLAN.sql against STAGING before prod, then deploy
-- push-fanout:  supabase functions deploy push-fanout --project-ref <ref>
-- ============================================================================
