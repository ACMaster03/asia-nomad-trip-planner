-- ============================================================================
-- 46-follower-legs-between-stops.sql — followers get only the legs between two
-- stops (Patrik, 10 Oct 2026; #166).
--
-- 45 gave followers every leg in the plan. The first one usually starts at home
-- ("Budapest → Bangkok"), so its `from` told a follower where you live, which
-- nothing else in the follower projection does and /privacy does not promise
-- ("how you travel between stops"). The same went for the way home, and for
-- a leg to a place that is not a stop yet.
--
-- Now a leg crosses only when both its ends are stops of the plan (include not
-- false), matched the way the app matches city names (norm.ts sameCity,
-- TimelineLogic.swift sameCity): drop a " (…)" suffix, trim, lowercase; one
-- name may be the other plus more words ("Hong Kong" / "Hong Kong Island").
-- The follower's globe starts at the first stop and draws no home.
--
-- 45-TESTPLAN.sql no longer holds after this: its "Da Nang → Hoi An" leg goes
-- to a place that is not a stop, so 46-TESTPLAN.sql is the one to run.
--
-- Adds public._same_city (internal: revoked from end users) and replaces 45's
-- _trip_summary_core; changes nothing else. Idempotent. Staging first, then
-- 46-TESTPLAN.sql there, then production.
-- ============================================================================

create or replace function public._same_city(a text, b text)
returns boolean
language sql immutable set search_path = public as $$
  select x <> '' and y <> '' and (x = y or starts_with(x, y || ' ') or starts_with(y, x || ' '))
  from (select lower(btrim(split_part(coalesce(a, ''), ' (', 1))) as x,
               lower(btrim(split_part(coalesce(b, ''), ' (', 1))) as y) n;
$$;
revoke all on function public._same_city(text, text) from public, anon, authenticated;

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
    'legs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'from', leg->>'from',
               'to',   leg->>'to',
               'date', leg->>'date',
               'mode', case lower(btrim(coalesce(leg->>'type', '')))
                         when 'flight' then 'flight'
                         when 'plane'  then 'flight'
                         when 'train'  then 'train'
                         when 'bus'    then 'bus'
                         when 'ferry'  then 'ferry'
                         else 'other'
                       end
             ) order by leg->>'date')
      from jsonb_array_elements(coalesce(t.state->'transport', '[]'::jsonb)) leg
      where coalesce((leg->>'include')::boolean, true)
        -- Only legs between two stops of the plan: never one from or to home.
        and exists (select 1 from jsonb_array_elements(coalesce(t.state->'segments', '[]'::jsonb)) s
                    where coalesce((s->>'include')::boolean, true)
                      and public._same_city(s->>'city', leg->>'from'))
        and exists (select 1 from jsonb_array_elements(coalesce(t.state->'segments', '[]'::jsonb)) s
                    where coalesce((s->>'include')::boolean, true)
                      and public._same_city(s->>'city', leg->>'to'))
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
