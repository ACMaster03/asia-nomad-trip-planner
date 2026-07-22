-- Migration 01 — enable document-model sync used by the app.
-- Run this in Supabase → SQL Editor if you already ran schema.sql before these
-- columns/policy existed. Safe to run more than once.

-- 1) Store the whole trip state + income ledger as JSON on the trip row.
alter table public.trips add column if not exists state  jsonb not null default '{}'::jsonb;
alter table public.trips add column if not exists ledger jsonb not null default '[]'::jsonb;

-- 2) Let trip EDITORS (your partner with role 'editor'), not just the owner,
--    update the shared doc.
--    AUTHORITY NOTE: 06-security.sql is the authority for RLS. This policy text
--    is kept aligned with 06 (role-aware + WITH CHECK) so re-running this file
--    on a live database does not silently reopen the viewer-write hole the old
--    role-blind can_access_trip() version had. can_edit_trip() is defined by
--    schema.sql (and again, identically, by 06).
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update
  using      (public.can_edit_trip(id))
  with check (public.can_edit_trip(id));
