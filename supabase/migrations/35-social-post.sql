-- ============================================================================
-- 35-social-post.sql — one post, by id (2026-09-17).
--
-- The post page (a check-in opened from Home, from a journey, or from a
-- notification) needs a single event in the follower projection. Nothing in
-- 33/34 serves one: shared_feed / following_feed page through a trip's feed.
-- This extracts the per-row projection out of _trip_feed_core into
-- _event_row_json() — one home for the shape, still — and adds two thin
-- readers on top of it:
--
--   * followed_event(p_event)        — signed-in: travellers on their own trip,
--                                      followers on posts they can see.
--   * shared_event(p_token, p_event) — anonymous link holders.
--
-- Same visibility predicates as 34 (_can_see_event / _token_can_see_event).
-- Nothing anon-facing changes shape: shared_feed rows are byte-identical
-- (35-TESTPLAN block 1 proves it against 33's twin projection check).
--
-- Idempotent, additive-only.
-- Depends on 33 (_trip_feed_core, _traveller_name), 34 (_can_see_event,
-- _token_can_see_event).
--
-- AUTHORITY NOTE: supersedes 33's _trip_feed_core() body (same signature,
-- same output). Always (re)apply 35 after 33.
-- ============================================================================

create or replace function public._event_row_json(e public.trip_events)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
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
  from (select 1) x
  left join public.check_ins ci on ci.event_id = e.id;
$$;
revoke all on function public._event_row_json(public.trip_events) from public, anon, authenticated;

create or replace function public._trip_feed_core(
  p_trips uuid[], p_authors uuid[], p_before timestamptz, p_limit int)
returns table (trip_id uuid, occurred_at timestamptz, row_ev jsonb)
language sql stable security definer set search_path = public as $$
  select e.trip_id, e.occurred_at, public._event_row_json(e)
  from public.trip_events e
  where e.trip_id = any (p_trips)
    and e.visibility in ('followers', 'public')
    and (p_authors is null or e.kind = 'arrived' or e.author = any (p_authors))
    and (p_before is null or e.occurred_at < p_before)
  order by e.occurred_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;
revoke all on function public._trip_feed_core(uuid[], uuid[], timestamptz, int) from public, anon, authenticated;

create or replace function public.followed_event(p_event uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select public._event_row_json(e)
      || jsonb_build_object('trip_id', e.trip_id, 'tripName', t.state->'meta'->>'tripName')
  from public.trip_events e
  join public.trips t on t.id = e.trip_id
  where e.id = p_event
    and auth.uid() is not null
    and public._can_see_event(e.id);
$$;
revoke all on function public.followed_event(uuid) from public, anon;
grant execute on function public.followed_event(uuid) to authenticated;

create or replace function public.shared_event(p_token text, p_event uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select public._event_row_json(e)
      || jsonb_build_object('trip_id', e.trip_id, 'tripName', t.state->'meta'->>'tripName')
  from public.trip_events e
  join public.trips t on t.id = e.trip_id
  where e.id = p_event
    and public._token_can_see_event(p_token, e.id);
$$;
revoke all on function public.shared_event(text, uuid) from public;
grant execute on function public.shared_event(text, uuid) to anon, authenticated;

-- ============================================================================
-- Done. Run 35-TESTPLAN.sql against STAGING before prod.
-- ============================================================================
