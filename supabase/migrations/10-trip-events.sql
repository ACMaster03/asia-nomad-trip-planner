-- ============================================================================
-- 10-trip-events.sql — trip_events + check_ins (M2 item 1, lived-trip regime)
--
-- Idempotent, additive-only. Depends on: 06 (can_edit_trip/can_view_trip),
-- 09 (places).
--
-- Design per the approved plan: the lived trip is APPEND-ONLY — no merge
-- conflicts by construction, realtime- and RLS-friendly, and each public
-- check-in later becomes a community review. Clients may supply the event id
-- (uuid) so the offline outbox can insert idempotently after reconnecting.
-- ============================================================================

create table if not exists public.trip_events (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  author      uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('checkin','note','arrived','media','location')),
  payload     jsonb not null default '{}'::jsonb,
  visibility  text not null default 'trip' check (visibility in ('trip','followers','public')),
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists trip_events_feed_idx on public.trip_events (trip_id, occurred_at desc);

-- Structured half of a check-in (rating/comment/place) — separate table so
-- P3's community reviews can aggregate over places without parsing payloads.
create table if not exists public.check_ins (
  event_id   uuid primary key references public.trip_events (id) on delete cascade,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  place_id   uuid references public.places (id) on delete set null,
  rating     smallint check (rating between 1 and 5),
  comment    text
);

create index if not exists check_ins_place_idx on public.check_ins (place_id);
create index if not exists check_ins_trip_idx  on public.check_ins (trip_id);

alter table public.trip_events enable row level security;
alter table public.check_ins   enable row level security;

-- Reads: anyone who can view the trip. (Anon followers NEVER read these
-- tables directly — M3's sanitized SECURITY DEFINER RPCs are their only path.)
drop policy if exists trip_events_select on public.trip_events;
create policy trip_events_select on public.trip_events for select
  to authenticated using (public.can_view_trip(trip_id));

drop policy if exists check_ins_select on public.check_ins;
create policy check_ins_select on public.check_ins for select
  to authenticated using (public.can_view_trip(trip_id));

-- Writes: editors only, and only as themselves.
drop policy if exists trip_events_insert on public.trip_events;
create policy trip_events_insert on public.trip_events for insert
  to authenticated
  with check (public.can_edit_trip(trip_id) and author = auth.uid());

drop policy if exists check_ins_insert on public.check_ins;
create policy check_ins_insert on public.check_ins for insert
  to authenticated
  with check (
    public.can_edit_trip(trip_id)
    and exists (
      select 1 from public.trip_events e
      where e.id = event_id and e.trip_id = check_ins.trip_id and e.author = auth.uid()
    )
  );

-- Append-only: NO update policies (a wrong check-in is deleted and redone).
-- Deletes: authors may remove their own events (cascade removes the check_in
-- row); this is the "undo" affordance in /live, not an edit path.
drop policy if exists trip_events_delete on public.trip_events;
create policy trip_events_delete on public.trip_events for delete
  to authenticated
  using (public.can_edit_trip(trip_id) and author = auth.uid());

drop policy if exists check_ins_delete on public.check_ins;
create policy check_ins_delete on public.check_ins for delete
  to authenticated
  using (
    public.can_edit_trip(trip_id)
    and exists (
      select 1 from public.trip_events e
      where e.id = event_id and e.author = auth.uid()
    )
  );
