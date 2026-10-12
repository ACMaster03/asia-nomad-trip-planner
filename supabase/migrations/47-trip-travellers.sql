-- ============================================================================
-- 47-trip-travellers.sql — the people who travel on a journey, by first name,
-- for anyone who can view it (Petra, 12 Oct 2026; docs/WEB-IOS-REDESIGN.md
-- round 2b).
--
-- Home's "Latest" shows the journey's own rows, and a co-traveller's check-in
-- read "A co-traveller": the web had no way to name the person, because the
-- follower projection's _traveller_name and _trip_travellers (33) are internal.
-- This is the one door: the owner and the editors with their first names, for
-- the owner, the editors and the viewers of the journey (can_view_trip), null
-- for anyone else. Viewers do not travel, so they are not in the list. The
-- names are the same first names a follower sees, nothing more.
--
-- Adds public.trip_travellers(uuid); changes nothing else. Idempotent. Staging
-- first, then 47-TESTPLAN.sql there, then production.
-- ============================================================================

create or replace function public.trip_travellers(p_trip uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.can_view_trip(p_trip)
    then coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', tr.user_id,
                'name', public._traveller_name(tr.user_id),
                'isOwner', tr.is_owner)
              order by tr.is_owner desc, public._traveller_name(tr.user_id))
         from public._trip_travellers(p_trip) tr),
      '[]'::jsonb)
    else null end;
$$;
revoke all on function public.trip_travellers(uuid) from public, anon;
grant execute on function public.trip_travellers(uuid) to authenticated;
