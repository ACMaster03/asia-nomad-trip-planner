-- Ticked stays whose `status` is missing or unrecognised.  Read-only.
--   →  tools/db.sh --prod sql supabase/checks/stay-status-scan.sql
--
-- Why this exists: until ed0a471 the Money page read `include` alone for
-- stays, so a ticked draft was billed as money owed. The fix gates on
-- `status` (product/src/lib/trips/commitment.ts):
--
--     isBookedStatus = ['booked','chosen'].includes((status ?? '').toLowerCase())
--
-- That flips the failure mode. A stay that is genuinely booked but carries no
-- `status` now reads as a draft and silently STOPS counting as owed. Every
-- code path sets one, so there should be NO `FLAGGED` rows below — this is the
-- check that says so rather than assuming it.
--
-- `include` is truthy-tested for stays in both spending.ts and budget.ts
-- (undefined = not ticked), so the filter matches the app exactly.
--
-- No psql metacommands: this has to run through the Management API path, which
-- is plain SQL only. Hence the label column instead of \echo headers, and the
-- single result set — the DISTRIBUTION rows always come back, so an empty
-- FLAGGED section reads as "clean" rather than as a query that did nothing.

select q.section, q.trip, q.stay, q.status, q.detail
  from (
    select 1                                                       as ord,
           'FLAGGED'                                               as section,
           t.name::text                                            as trip,
           (s->>'name')::text                                      as stay,
           coalesce(nullif(trim(s->>'status'), ''), 'NULL/EMPTY')  as status,
           concat_ws(' ', s->>'cur', s->>'ppn', 'ppn ×',
                     coalesce(s->>'nights', '?'), 'nights')        as detail
      from public.trips t
      cross join lateral
           jsonb_array_elements(coalesce(t.state->'stays', '[]'::jsonb)) s
     where coalesce((s->>'include')::boolean, false)
       and lower(coalesce(trim(s->>'status'), ''))
           not in ('booked', 'chosen', 'idea', 'shortlist')

    union all

    select 2,
           'DISTRIBUTION',
           null::text,
           null::text,
           coalesce(nullif(trim(s->>'status'), ''), 'NULL/EMPTY'),
           count(*)::text || ' stays, ' ||
           count(*) filter (
             where coalesce((s->>'include')::boolean, false)
           )::text || ' ticked'
      from public.trips t
      cross join lateral
           jsonb_array_elements(coalesce(t.state->'stays', '[]'::jsonb)) s
     group by 5
  ) q
 order by q.ord, q.status, q.trip;
