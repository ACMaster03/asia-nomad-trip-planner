-- ============================================================================
-- 07-multi-trip.sql — per-ACCOUNT active-trip selection (M1 item 5)
--
-- Depends on: 06-security.sql (uses public.can_view_trip in the guard trigger).
-- Idempotent and additive-only, same contract as 06. NOT applied to any DB by
-- the repo — run on staging first, then prod (see 06-TESTPLAN.md workflow).
--
-- Design (from the approved endframe, design/mocks/09-settings.html):
--   "Switching the active trip is per account (stored on the profile, synced by
--    Supabase) — not per device — so Patrik's phone and laptop always show the
--    same trip."
-- The client resolves the working trip as:
--   profiles.active_trip_id → if null/not-visible, newest RLS-visible trip.
-- On a database WITHOUT this migration the column is simply absent from
-- select('*') rows and the client keeps the legacy newest-visible behaviour.
-- ============================================================================

-- The pointer. ON DELETE SET NULL: deleting a trip silently clears any
-- profiles that pointed at it (resolution then falls back to newest-visible).
alter table public.profiles
  add column if not exists active_trip_id uuid references public.trips (id) on delete set null;

-- Guard: a user may only point their profile at a trip they can actually see.
-- Without this, setting a random UUID is harmless (RLS hides the trip and the
-- client falls back) but it would leak "this UUID exists" through the FK error
-- vs success distinction — so validate against can_view_trip explicitly.
-- The existing profiles_guard_admin trigger (03) keeps guarding is_admin;
-- this one only inspects active_trip_id. SECURITY DEFINER is NOT needed:
-- can_view_trip (06) is already definer-safe and search_path-pinned.
create or replace function public.guard_profile_active_trip()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Privileged contexts (SQL editor, service_role) have auth.uid() = null and
  -- bypass the check — same convention as 06's RPC pre-checks. RLS still
  -- prevents ordinary users from reaching this trigger for other rows.
  if auth.uid() is null then
    return new;
  end if;
  if new.active_trip_id is not null
     and new.active_trip_id is distinct from old.active_trip_id
     and not public.can_view_trip(new.active_trip_id) then
    raise exception 'not allowed to select this trip' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_active_trip on public.profiles;
create trigger profiles_guard_active_trip
  before update of active_trip_id on public.profiles
  for each row execute function public.guard_profile_active_trip();
