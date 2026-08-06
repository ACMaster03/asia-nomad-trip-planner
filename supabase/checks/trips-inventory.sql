-- Every trip in the database, with enough context to tell a real trip from a
-- dogfood leftover. Read-only.  →  tools/db.sh trips
--
-- Why this exists: PHONE-TESTPLAN F9 told you to delete the test trips from
-- Settings, but trip deletion did not exist until migration 26 — so the trips
-- created during the 2026-07-24 phone pass are still here.
--
-- ⚠️ Delete them THROUGH THE APP (Settings → Danger zone), not with SQL.
-- A raw `delete from trips` cascades the rows but leaves the photos orphaned
-- in the trip-media bucket, where they keep consuming the 1 GB free tier and
-- can no longer be reached by anything.

\echo '── every trip ─────────────────────────────────────────────────────────'
select t.id,
       t.name,
       t.created_at::date                                    as created,
       coalesce(p.display_name, '?')                         as owner,
       (select count(*) from public.trip_events  e where e.trip_id  = t.id) as events,
       (select count(*) from public.trip_members m where m.trip_id  = t.id) as members,
       (select count(*) from public.trip_shares  s where s.trip_id  = t.id
                                                     and s.revoked_at is null) as links,
       (select count(*) from storage.objects o
         where o.bucket_id = 'trip-media' and o.name like t.id::text || '/%') as photos
  from public.trips t
  left join public.profiles p on p.id = t.owner
 order by t.created_at desc;

\echo ''
\echo '── photo storage per trip folder, incl. any ORPHANED folders ──────────'
\echo '   (a folder whose trip no longer exists = files nothing can reach)'
select split_part(o.name, '/', 1)              as trip_folder,
       count(*)                                as objects,
       pg_size_pretty(sum((o.metadata->>'size')::bigint)) as size,
       exists (select 1 from public.trips t
                where t.id::text = split_part(o.name, '/', 1)) as trip_still_exists
  from storage.objects o
 where o.bucket_id = 'trip-media'
 group by 1
 order by 2 desc;
