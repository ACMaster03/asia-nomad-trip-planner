-- ============================================================================
-- 45-follower-leg-modes.sql — followers see how you travel between stops
-- (Patrik, 4 Oct 2026; #166).
--
-- The follower's globe replays a journey with the vehicle of each leg (a plane,
-- a train, a bus, a ferry), so the follower projection gains one list, `legs`:
-- for each leg, where it starts, where it ends, its date and its MODE. Nothing
-- else from a leg crosses: no provider, price, currency, time, booking link,
-- notes, status or via. A via is a place you pass through, so it stays out too.
--
-- THE MODE IS A FIXED WORD, NEVER THE TYPED TEXT. `type` is free text in the
-- journey ("Flight", "Ferry", "Tuk-tuk to the border"); the projection maps it
-- to one of flight, train, bus, ferry or other, the four the app draws an icon
-- for (product/src/components/trips/Timeline.tsx TypeIcon, ios TransportIcon)
-- plus the old "plane". Anything typed by hand reads as "other".
--
-- ONE CORE, BOTH PATHS. _trip_summary_core feeds the signed-in follower
-- (followed_trip_summary) and the link page without an account
-- (shared_trip_summary), as 33 built it so the two never drift. Both get legs.
-- The privacy page's "If you follow a trip without an account" says the same.
--
-- Legs left out of the plan (include = false) stay out, as stops do.
--
-- This file replaces 33's _trip_summary_core and changes nothing else. The
-- load-bearing rule of 33 still holds: can_follow_trip() never appears in a
-- table policy. Idempotent. Staging first, then 45-TESTPLAN.sql there.
-- ============================================================================

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
