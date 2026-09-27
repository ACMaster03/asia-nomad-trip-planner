-- ============================================================================
-- 43-home-base.sql — where you live, on the person (#58; Patrik, 27 Sep 2026).
--
-- "Home is a person-level origin. Where you live is a fact about the account,
-- not the journey; every journey starts there and returns there without being
-- asked." (#58). Until now it was only the journey's `state.meta.homeBase`,
-- typed in the new-journey wizard. The app reads this column first and falls
-- back to the journey's value, which stays in the document: older journeys,
-- and the iOS app until it reads the profile, keep working unchanged. On a
-- shared journey each traveller sees their own home as the first and last node
-- of the timeline.
--
-- Free text in the wizard's shape, "Budapest, Hungary": the city before the
-- first comma is what the timeline shows. Null = not set.
--
-- BACKFILL, so nobody types it twice: an empty profile takes the home of the
-- most recently updated journey its person OWNS. A member who owns no journey
-- starts empty and sees the journey's home meanwhile. Only empty profiles are
-- written, so a re-run never overwrites a home someone set.
--
-- PERMISSIONS NEED NOTHING NEW. profiles_update (03) lets a signed-in user
-- update their own row and no one else's; the guard triggers look only at
-- is_admin (03) and active_trip_id (07). Co-members of a shared trip can read
-- the row (06, for display_name), so a travel partner can read this too. The
-- journey's home was already readable by every member of the journey.
--
-- ORDER: apply before the app code that selects the column reaches production.
-- 42 is #101's (42-session-idle-purge.sql), hence 43.
--
-- Idempotent and additive-only. Staging first, then 43-TESTPLAN.sql there.
-- ============================================================================

alter table public.profiles
  add column if not exists home_base text;

comment on column public.profiles.home_base is
  'Where the person lives (#58), e.g. "Budapest, Hungary": the first and last node of every journey. Null = not set; the journey''s state.meta.homeBase is the fallback.';

update public.profiles p
set home_base = src.home
from (
  select distinct on (t.owner) t.owner, btrim(t.state->'meta'->>'homeBase') as home
  from public.trips t
  where coalesce(btrim(t.state->'meta'->>'homeBase'), '') <> ''
  order by t.owner, t.updated_at desc
) src
where p.id = src.owner
  and p.home_base is null;
