-- ============================================================================
-- 15-event-edits.sql — edit your own past check-ins/notes (owner request
-- 2026-07-24: "the restaurant felt 5★ until our stomachs voted").
--
-- Softens the append-only rule DELIBERATELY and narrowly: only the AUTHOR may
-- update their own rows (rating/comment/payload/visibility). Inserts remain
-- the only offline path — edits are online-only, so the outbox's idempotent
-- replay story is untouched. edited_at powers an honest "(edited)" marker.
--
-- Idempotent, additive-only. Depends on 10 (tables) + 06 (can_edit_trip).
-- ============================================================================

alter table public.trip_events add column if not exists edited_at timestamptz;

drop policy if exists trip_events_update on public.trip_events;
create policy trip_events_update on public.trip_events
  for update to authenticated
  using (author = auth.uid() and public.can_edit_trip(trip_id))
  with check (author = auth.uid() and public.can_edit_trip(trip_id));

drop policy if exists check_ins_update on public.check_ins;
create policy check_ins_update on public.check_ins
  for update to authenticated
  using (exists (
    select 1 from public.trip_events e
    where e.id = event_id and e.author = auth.uid()
  ))
  with check (exists (
    select 1 from public.trip_events e
    where e.id = event_id and e.author = auth.uid()
  ));
