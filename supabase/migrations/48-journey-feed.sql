-- ============================================================================
-- 48-journey-feed.sql — the traveller's own side of the feed, in one call
-- (Petra, 12 and 25 Oct 2026; #130; the iOS app's Feed tab).
--
-- The Feed tab shows a journey's posts with what the followers left on them,
-- and "New": who reacted and who commented, newest first. Everything it needs
-- existed per post (feed_social, event_reactors, event_comments_list, 34), but
-- not across a journey: a traveller had no way to ask "what is new on my posts"
-- without one call per post. This is that call, read-only.
--
-- public.journey_feed(p_trip, p_limit, p_before) returns, for anyone who can
-- view the journey (can_view_trip: its travellers and viewers), null for
-- anyone else:
--   posts:    the journey's check-ins, arrivals and notes, newest first, in the
--             follower feed's shape (_event_row_json, 35) plus their visibility,
--             the caller's own reaction ("mine"), the comment count and the
--             tally per kind. Pages of at most 50, older than p_before.
--   activity: on the first page only (p_before null), the 40 newest reactions
--             and comments on the journey's posts by anyone but the caller,
--             with the person's first name and the post they are on. Accounts
--             the caller blocked are left out, as are deleted comments.
-- When the caller last looked is kept on the phone, not here.
--
-- The counts and names go to travellers only, as in 34 (feed_social's tally,
-- event_reactors): a follower never gets them from this call.
--
-- Adds public.journey_feed(uuid, int, timestamptz); changes nothing else.
-- Idempotent. Staging first, then 48-TESTPLAN.sql there, then production.
-- ============================================================================

create or replace function public.journey_feed(
  p_trip uuid, p_limit int default 30, p_before timestamptz default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  posts as (
    select e as ev
    from public.trip_events e
    where e.trip_id = p_trip
      and e.kind in ('checkin', 'arrived', 'note')
      and (p_before is null or e.occurred_at < p_before)
    order by e.occurred_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 50)
  ),
  blocked as (
    select b.blocked_id from public.user_blocks b, me where b.blocker_id = me.uid
  ),
  activity as (
    select * from (
      select 'reaction' as kind, r.event_id || ':' || r.user_id as id, r.event_id, r.user_id,
             r.kind as reaction, null::text as body, null::uuid as parent_id, r.created_at as at
      from public.event_reactions r, me
      where r.trip_id = p_trip and r.user_id <> me.uid
      union all
      select 'comment', c.id::text, c.event_id, c.author,
             null, c.body, c.parent_id, c.created_at
      from public.event_comments c, me
      where c.trip_id = p_trip and c.deleted_at is null and c.author <> me.uid
    ) a
    where p_before is null
      and a.user_id not in (select blocked_id from blocked)
    order by a.at desc
    limit 40
  )
  select case when auth.uid() is not null and public.can_view_trip(p_trip) then jsonb_build_object(
    'posts', coalesce((
      select jsonb_agg(
        public._event_row_json(p.ev) || jsonb_strip_nulls(jsonb_build_object(
          'trip_id', (p.ev).trip_id,
          'visibility', (p.ev).visibility,
          'mine', (select r.kind from public.event_reactions r
                    where r.event_id = (p.ev).id and r.user_id = auth.uid()),
          'commentCount', (select count(*) from public.event_comments c
                            where c.event_id = (p.ev).id and c.deleted_at is null),
          'tally', coalesce((
            select jsonb_agg(jsonb_build_object('kind', k.key, 'count', k.n) order by k.n desc, k.sort)
            from (select r.kind as key, count(*) as n, min(rk.sort) as sort
                    from public.event_reactions r join public.reaction_kinds rk on rk.key = r.kind
                   where r.event_id = (p.ev).id group by r.kind) k
          ), '[]'::jsonb)))
        order by (p.ev).occurred_at desc)
      from posts p
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', a.id,
        'kind', a.kind,
        'event_id', a.event_id,
        'user_id', a.user_id,
        'name', public._traveller_name(a.user_id),
        'reaction', a.reaction,
        'body', a.body,
        'parent_id', a.parent_id,
        'at', a.at,
        'post', jsonb_build_object(
          'kind', e.kind,
          'author', e.author,
          'authorName', public._traveller_name(e.author),
          'place', case e.kind when 'checkin' then e.payload->>'placeName'
                               when 'arrived' then e.payload->>'city' end)
      )) order by a.at desc)
      from activity a join public.trip_events e on e.id = a.event_id
    ), '[]'::jsonb)
  ) end;
$$;
revoke all on function public.journey_feed(uuid, int, timestamptz) from public, anon;
grant execute on function public.journey_feed(uuid, int, timestamptz) to authenticated;
