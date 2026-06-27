-- Migration 01 — enable document-model sync used by the app.
-- Run this in Supabase → SQL Editor if you already ran schema.sql before these
-- columns/policy existed. Safe to run more than once.

-- 1) Store the whole trip state + income ledger as JSON on the trip row.
alter table public.trips add column if not exists state  jsonb not null default '{}'::jsonb;
alter table public.trips add column if not exists ledger jsonb not null default '[]'::jsonb;

-- 2) Let trip members (your partner), not just the owner, update the shared doc.
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update using (public.can_access_trip(id));
