-- ============================================================================
-- tools/goal-numbers.sql — the numbers of the 30 November goal (#120;
-- docs/PLAN-OCT-NOV-2026.md): eight journeys by strangers, each with a
-- follower, eight to sixteen followers opening weekly, every traveller checking
-- in weekly. Read-only. Every Monday, with Patrik's go:
--
--   echo PROD | tools/db.sh --prod sql tools/goal-numbers.sql
--
-- The numbers go into the log table in docs/PLAN-OCT-NOV-2026.md.
--
-- Definitions:
--   stranger         an account created on or after 31 Oct 2026 (the day the
--                    link goes out), so the owners, family and testers are out.
--   stranger journey a journey a stranger created on or after 31 Oct. A travel
--                    partner joins that journey, so a couple counts once.
--   this week        the last 7 days, today included (UTC).
--   follower opens   feed_open_days (migration 49): a follower account that
--                    follows one of the journey's travellers, or the journey's
--                    follow link (one link may be several family members on
--                    one phone each: it counts once).
--   check-in         a trip_events row of kind 'checkin'.
-- The "everyone" rows count the same things over all accounts, for context.
-- ============================================================================

with
p as (
  select timestamptz '2026-10-31 00:00:00+00' as launch,
         current_date - 6 as week_from,             -- 7 days, today included
         (current_date - 6)::timestamptz as week_from_ts
),
strangers as (
  select u.id from auth.users u, p where u.created_at >= p.launch
),
s_trips as (
  select t.id from public.trips t join strangers s on s.id = t.owner, p
  where t.created_at >= p.launch
),
s_travellers as (
  select st.id as trip_id, tr.user_id
  from s_trips st cross join lateral public._trip_travellers(st.id) tr
),
s_followers as (            -- accounts that follow a traveller on a stranger journey
  select distinct f.follower_id, tr.trip_id
  from public.user_follows f join s_travellers tr on tr.user_id = f.followee_id
),
opens as (
  select d.* from public.feed_open_days d, p where d.day >= p.week_from
),
s_open_accounts as (
  select distinct o.follower_id from opens o join s_followers sf on sf.follower_id = o.follower_id
),
s_open_links as (
  select distinct o.share_id from opens o join public.trip_shares sh on sh.id = o.share_id
  join s_trips st on st.id = sh.trip_id
),
checkins as (
  select distinct e.author, e.trip_id from public.trip_events e, p
  where e.kind = 'checkin' and e.created_at >= p.week_from_ts
),
sources as (
  select coalesce(a.source,
           case when exists (select 1 from public.journey_signups j
                              where lower(j.email) = lower(u.email))
                then 'landing_form' else 'direct' end) as source
  from auth.users u join strangers s on s.id = u.id
  left join public.account_sources a on a.user_id = u.id
)
select 1 as ord, 'Journeys by strangers' as number, count(*)::text as value from s_trips
union all
select 2, '… with a follower (an account, or its link opened this week)',
  (select count(*) from s_trips st
    where exists (select 1 from s_followers sf where sf.trip_id = st.id)
       or exists (select 1 from public.trip_shares sh join opens o on o.share_id = sh.id
                   where sh.trip_id = st.id))::text
union all
select 3, 'Followers of stranger journeys who opened this week',
  ((select count(*) from s_open_accounts) + (select count(*) from s_open_links))::text
union all
select 4, '… of them follower accounts / follow links',
  (select count(*) from s_open_accounts)::text || ' / ' || (select count(*) from s_open_links)::text
union all
select 5, 'Travellers on stranger journeys',
  (select count(distinct user_id) from s_travellers)::text
union all
select 6, '… who checked in this week',
  (select count(distinct c.author) from checkins c join s_travellers tr
     on tr.trip_id = c.trip_id and tr.user_id = c.author)::text
union all
select 7, 'Strangers by source: follow link / partner invite / landing form / direct',
  (select count(*) filter (where source = 'follow_link')::text || ' / ' ||
          count(*) filter (where source = 'partner_invite')::text || ' / ' ||
          count(*) filter (where source = 'landing_form')::text || ' / ' ||
          count(*) filter (where source = 'direct')::text from sources)
union all
select 8, 'Everyone: feed opened this week, accounts / links',
  (select count(distinct follower_id) from opens)::text || ' / ' ||
  (select count(distinct share_id) from opens)::text
union all
select 9, 'Everyone: travellers who checked in this week',
  (select count(distinct author) from checkins)::text
order by ord;
