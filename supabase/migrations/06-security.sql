-- ============================================================================
-- 06-security.sql — role-aware RLS, owner freeze, invite hardening, and
--                   revision-guarded document writes (state_rev / ledger_rev).
-- ============================================================================
-- WHAT THIS FIXES
--   1. can_access_trip() was role-blind: a 'viewer' member could WRITE the trip
--      document (trips_update had no role check and no WITH CHECK). We split it
--      into can_view_trip() / can_edit_trip() and rewrite the write policies.
--   2. trips.owner could be changed by any member via UPDATE. A trigger now
--      freezes it (same pattern as guard_profile_admin_flag in 03-catalogue.sql).
--   3. An invitee could self-insert into trip_members with ANY role (invited as
--      'viewer', join as 'editor'), and could even UPDATE their own invite row
--      to role='editor' before accepting. Both holes are closed.
--   4. SECURITY DEFINER functions get search_path pinned to public.
--   5. Trip co-members may read each other's profiles row (display_name is
--      needed for activity feeds). Everything else stays self-or-admin.
--   6. trips gains integer revision counters (state_rev, ledger_rev) plus RPCs:
--        write_state(...)          — optimistic-concurrency state writes
--        ledger_upsert_entry(...)  — merge ONE ledger entry (no whole-array LWW)
--        ledger_delete_entry(...)  — remove ONE ledger entry by id
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste whole file -> Run.
-- Staging first. Idempotent: safe to re-run (create-or-replace / if-not-exists /
-- drop-policy-if-exists). Additive only — no data is dropped or rewritten.
--
-- APP COMPATIBILITY: the product app detects the new columns at runtime; until
-- this migration is applied it keeps using the legacy direct-update path, so
-- deploy order (app first or SQL first) does not matter.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) ROLE-AWARE ACCESS HELPERS
--    can_view_trip  — owner or ANY member (viewer or editor). Read access.
--    can_edit_trip  — owner or member with role 'editor'. Write access.
--    can_access_trip — kept as an alias of can_view_trip so every existing
--    policy that still references it (child tables, invites select, members
--    select) keeps working unchanged. SECURITY DEFINER (as before) so policies
--    can call them without RLS recursion; search_path pinned (see section 4).
-- ---------------------------------------------------------------------------
create or replace function public.can_view_trip(t uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.trips        where id = t and owner = auth.uid())
      or exists (select 1 from public.trip_members where trip_id = t and user_id = auth.uid());
$$;

create or replace function public.can_edit_trip(t uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.trips        where id = t and owner = auth.uid())
      or exists (select 1 from public.trip_members where trip_id = t and user_id = auth.uid()
                                                     and role = 'editor');
$$;

-- Backwards-compatible alias: "access" now means VIEW. Anywhere write access is
-- meant, the policies below are rewritten to can_edit_trip explicitly.
create or replace function public.can_access_trip(t uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.can_view_trip(t);
$$;


-- ---------------------------------------------------------------------------
-- 2) TRIPS — proper UPDATE policy + owner column freeze
-- ---------------------------------------------------------------------------
-- Only editors (or the owner) may update the trip row, and the updated row must
-- still satisfy the same predicate (WITH CHECK). The old policy had no role
-- check and no WITH CHECK at all.
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update
  using      (public.can_edit_trip(id))
  with check (public.can_edit_trip(id));

-- Freeze trips.owner. Mirrors guard_profile_admin_flag (03-catalogue.sql):
-- only a REAL authenticated end-user is blocked; privileged contexts (SQL
-- Editor, migrations, service_role — where auth.uid() is null) may still
-- transfer ownership deliberately.
create or replace function public.guard_trip_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner is distinct from old.owner and auth.uid() is not null then
    raise exception 'trips.owner is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trips_guard_owner on public.trips;
create trigger trips_guard_owner
  before update on public.trips
  for each row execute function public.guard_trip_owner();


-- ---------------------------------------------------------------------------
-- 3) INVITES + MEMBERS — no self-escalation
-- ---------------------------------------------------------------------------
-- 3a) What role was I invited with? (pending invite for my signed-in email;
--     newest wins if several exist). SECURITY DEFINER: policies need to read
--     trip_invites without recursing into its RLS.
create or replace function public.pending_invite_role(t uuid)
returns text language sql security definer stable set search_path = public as $$
  select i.role
  from public.trip_invites i
  where i.trip_id = t and i.status = 'pending'
    and lower(i.email) = lower(auth.jwt() ->> 'email')
  order by i.created_at desc
  limit 1;
$$;

-- 3b) trip_members INSERT: the owner adds anyone; an invitee may add ONLY
--     themselves and ONLY with the exact role on their pending invite.
--     (Old policy accepted any role as long as a pending invite existed.)
drop policy if exists members_insert on public.trip_members;
create policy members_insert on public.trip_members for insert
  with check (
    exists (select 1 from public.trips where id = trip_id and owner = auth.uid())
    or ( user_id = auth.uid() and role = public.pending_invite_role(trip_id) )
  );

-- 3c) trip_invites INSERT: creating invites is a WRITE-level action — a viewer
--     must not be able to invite (they could otherwise invite a second account
--     of their own as 'editor' and escalate). Was: can_access_trip (any member).
drop policy if exists invites_insert on public.trip_invites;
create policy invites_insert on public.trip_invites for insert
  with check ( public.can_edit_trip(trip_id) and invited_by = auth.uid() );

-- 3d) trip_invites UPDATE: editors/owner manage invites (revoke etc.); the
--     invitee may touch their own invite row — but ONLY to accept it. Without
--     a constraint, the invitee could set role='editor' on their pending invite
--     BEFORE accepting, defeating 3b. WITH CHECK cannot see the OLD row, so the
--     invitee path is constrained by a trigger (same pattern as the owner
--     freeze above).
drop policy if exists invites_update on public.trip_invites;
create policy invites_update on public.trip_invites for update
  using      ( public.can_edit_trip(trip_id) or lower(email) = lower(auth.jwt() ->> 'email') )
  with check ( public.can_edit_trip(trip_id) or lower(email) = lower(auth.jwt() ->> 'email') );

create or replace function public.guard_invite_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Privileged contexts (SQL Editor / service_role) and trip editors/owner may
  -- update invites freely (e.g. revoke).
  if auth.uid() is null or public.can_edit_trip(old.trip_id) then
    return new;
  end if;
  -- Anyone else reaching this row is the addressed invitee (per the policy).
  -- The ONLY allowed transition is accepting their own pending invite as-is:
  if old.status <> 'pending'
     or new.status <> 'accepted'
     or new.id         is distinct from old.id
     or new.role       is distinct from old.role
     or new.email      is distinct from old.email
     or new.trip_id    is distinct from old.trip_id
     or new.invited_by is distinct from old.invited_by
     or new.accepted_by is distinct from auth.uid() then
    raise exception 'invitees may only accept their own pending invite (no field changes)'
      using errcode = '42501';
  end if;
  -- Stamp the acceptance time server-side (never trust the client's clock).
  new.accepted_at := now();
  return new;
end;
$$;
drop trigger if exists invites_guard_update on public.trip_invites;
create trigger invites_guard_update
  before update on public.trip_invites
  for each row execute function public.guard_invite_update();

-- 3e) Child itinerary tables (segments/stays/transport/extras/notes/ledger):
--     these are unused by the app today but had role-blind ALL policies
--     ("for all using can_access_trip"). Split into view-read / edit-write so
--     a viewer cannot write here either.
do $$
declare tbl text;
begin
  foreach tbl in array array['segments','stays','transport','extras','notes','ledger']
  loop
    execute format('drop policy if exists %1$s_all on public.%1$s;', tbl);
    execute format('drop policy if exists %1$s_select on public.%1$s;', tbl);
    execute format('drop policy if exists %1$s_write  on public.%1$s;', tbl);
    execute format(
      'create policy %1$s_select on public.%1$s for select using (public.can_view_trip(trip_id));',
      tbl);
    execute format(
      'create policy %1$s_write on public.%1$s for all using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));',
      tbl);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 4) PIN search_path = public ON ALL SECURITY DEFINER FUNCTIONS
--    (prevents search_path hijacking of definer functions). New/recreated
--    functions above already carry the pin; this covers the pre-existing ones.
--    Guarded with to_regprocedure so the block also runs cleanly on a fresh
--    database where 03-catalogue.sql hasn't been applied yet.
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.can_access_trip(uuid)',
    'public.can_view_trip(uuid)',
    'public.can_edit_trip(uuid)',
    'public.has_pending_invite(uuid)',
    'public.pending_invite_role(uuid)',
    'public.is_admin()',
    'public.handle_new_user()',
    'public.guard_profile_admin_flag()',
    'public.guard_trip_owner()',
    'public.guard_invite_update()'
  ]
  loop
    if to_regprocedure(fn) is not null then
      execute format('alter function %s set search_path = public;', fn);
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 5) PROFILES — co-members of a shared trip may read each other's row
--    (the UI needs display_name for "edited by …" feeds). This is an
--    ADDITIONAL permissive select policy; the existing self-or-admin policies
--    from 03-catalogue.sql are untouched. Note: row-level select also exposes
--    the is_admin boolean to co-members — it is not a secret (it only gates
--    catalogue curation) and RLS on the catalogue is the real boundary.
-- ---------------------------------------------------------------------------
-- display_name exists since 03-catalogue.sql; guard anyway for fresh databases.
alter table public.profiles add column if not exists display_name text;

-- Do the signed-in user and `target` share at least one trip (as owner or member)?
-- SECURITY DEFINER so the check doesn't recurse into trips/trip_members RLS.
create or replace function public.shares_trip_with(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from (
      select id as trip_id from public.trips        where owner   = auth.uid()
      union
      select trip_id       from public.trip_members where user_id = auth.uid()
    ) mine
    where exists (select 1 from public.trips t
                  where t.id = mine.trip_id and t.owner = target)
       or exists (select 1 from public.trip_members m
                  where m.trip_id = mine.trip_id and m.user_id = target)
  );
$$;

drop policy if exists profiles_select_comembers on public.profiles;
create policy profiles_select_comembers on public.profiles for select
  using ( public.shares_trip_with(id) );


-- ---------------------------------------------------------------------------
-- 6) REVISION COUNTERS on the trip document columns
--    state_rev  — bumped by every successful write_state()
--    ledger_rev — bumped by every successful ledger_*_entry()
--    DEFAULT 0 NOT NULL: existing rows immediately get rev 0; the app treats a
--    missing column (pre-migration) as "use legacy direct updates".
-- ---------------------------------------------------------------------------
alter table public.trips add column if not exists state_rev  integer not null default 0;
alter table public.trips add column if not exists ledger_rev integer not null default 0;

-- Defense-in-depth: end-users must not write the rev counters directly — only
-- the RPCs below bump them. HONEST CAVEAT (same as the is_admin revoke in
-- 03-catalogue.sql): Postgres column privileges are ADDITIVE to table-level
-- ones, so while `authenticated` holds the Supabase-default table-level UPDATE
-- on trips this revoke is inert; it only starts biting if table-level UPDATE is
-- ever replaced by per-column grants. Doing that today would also break the
-- SECURITY INVOKER RPCs below (they update state_rev/ledger_rev AS the caller),
-- which would then have to become SECURITY DEFINER. Declared intent, not the
-- enforcement mechanism — the RPCs + policies are the real guard.
revoke update (state_rev, ledger_rev) on public.trips from authenticated;


-- ---------------------------------------------------------------------------
-- 7) write_state(trip, new_state, new_name, expected_rev) -> new state_rev
--    Optimistic concurrency for the whole-document `state` column: the write
--    only lands if the caller saw the current revision. On a mismatch it
--    raises SQLSTATE 'REV01' — the app catches exactly that code, rolls back
--    its optimistic UI update and refetches. NEVER compares updated_at.
--
--    SECURITY INVOKER (the default): the inner UPDATE runs under the caller's
--    RLS, so trips_update (can_edit_trip) is enforced by the database itself.
--    The explicit can_edit_trip() check up front only exists to return a clean
--    'not editable' error instead of a misleading rev-conflict for viewers
--    (viewers can SELECT the row, but their UPDATE would match 0 rows). It is
--    skipped when auth.uid() is null so service_role (which bypasses RLS but
--    has no uid, making can_edit_trip() false) can still call the RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.write_state(
  trip         uuid,
  new_state    jsonb,
  new_name     text,
  expected_rev integer
)
returns integer
language plpgsql volatile
set search_path = public
as $$
declare
  v_rev integer;
begin
  -- Clean-error pre-check for real end-users only. Privileged callers
  -- (service_role — auth.uid() is null) skip it: can_edit_trip() would be
  -- false for them even though they legitimately bypass RLS on the UPDATE.
  if auth.uid() is not null and not public.can_edit_trip(trip) then
    raise exception 'not allowed to edit this trip' using errcode = '42501';
  end if;
  if new_state is null or expected_rev is null then
    raise exception 'new_state and expected_rev are required' using errcode = '22023';
  end if;

  update public.trips
     set state      = new_state,
         name       = coalesce(new_name, name),
         state_rev  = state_rev + 1,
         updated_at = now()
   where id = trip
     and state_rev = expected_rev
  returning state_rev into v_rev;

  if v_rev is null then
    -- Editability was checked above, so a 0-row update means the rev didn't
    -- match (someone else wrote `state` since the caller last read it) — or,
    -- for privileged callers that skipped the pre-check, a missing trip.
    select state_rev into v_rev from public.trips where id = trip;
    if v_rev is null then
      raise exception 'trip not found' using errcode = 'P0002';
    end if;
    raise exception 'rev_conflict: expected state_rev %, current is %', expected_rev, v_rev
      using errcode = 'REV01';
  end if;
  return v_rev;
end;
$$;

-- NOTE: no whole-document write-ledger RPC is provided on purpose — the app's
-- only ledger writes are per-entry (below), which are merge-safe without an
-- expected_rev. There is no import flow today; add a guarded write_ledger()
-- only if one appears.


-- ---------------------------------------------------------------------------
-- 8) PER-ENTRY LEDGER MERGE RPCs — replace the whole-array last-write-wins
--    ledger writes. Each mutates exactly ONE entry (matched by its JSON `id`)
--    inside trips.ledger in a single UPDATE statement, so two people adding
--    entries at the same time can no longer wipe each other's rows.
--    SECURITY INVOKER: the UPDATE is RLS-checked (can_edit_trip) by the
--    database; the explicit check gives a clean error for viewers.
-- ---------------------------------------------------------------------------

-- Append a new entry, or replace the existing entry with the same `id`.
-- (Position in the array is not preserved on replace — the app sorts by date.)
create or replace function public.ledger_upsert_entry(trip uuid, entry jsonb)
returns integer
language plpgsql volatile
set search_path = public
as $$
declare
  v_rev integer;
begin
  -- Clean-error pre-check for real end-users only. Privileged callers
  -- (service_role — auth.uid() is null) skip it: can_edit_trip() would be
  -- false for them even though they legitimately bypass RLS on the UPDATE.
  if auth.uid() is not null and not public.can_edit_trip(trip) then
    raise exception 'not allowed to edit this trip' using errcode = '42501';
  end if;
  if entry is null or coalesce(entry ->> 'id', '') = '' then
    -- Without this guard a null id would make the filter below drop EVERY row.
    raise exception 'ledger entry must be an object with a non-empty "id"' using errcode = '22023';
  end if;

  update public.trips
     set ledger = coalesce(
                    (select jsonb_agg(e)
                     from jsonb_array_elements(ledger) e
                     where e ->> 'id' is distinct from entry ->> 'id'),
                    '[]'::jsonb
                  ) || jsonb_build_array(entry),
         ledger_rev = ledger_rev + 1,
         updated_at = now()
   where id = trip
  returning ledger_rev into v_rev;

  if v_rev is null then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;
  return v_rev;
end;
$$;

-- Remove the entry with the given id (no-op on the array if the id is absent,
-- but the rev still bumps so clients converge on a refetch).
create or replace function public.ledger_delete_entry(trip uuid, entry_id text)
returns integer
language plpgsql volatile
set search_path = public
as $$
declare
  v_rev integer;
begin
  -- Clean-error pre-check for real end-users only. Privileged callers
  -- (service_role — auth.uid() is null) skip it: can_edit_trip() would be
  -- false for them even though they legitimately bypass RLS on the UPDATE.
  if auth.uid() is not null and not public.can_edit_trip(trip) then
    raise exception 'not allowed to edit this trip' using errcode = '42501';
  end if;
  if coalesce(entry_id, '') = '' then
    raise exception 'entry_id is required' using errcode = '22023';
  end if;

  update public.trips
     set ledger = coalesce(
                    (select jsonb_agg(e)
                     from jsonb_array_elements(ledger) e
                     where e ->> 'id' is distinct from entry_id),
                    '[]'::jsonb
                  ),
         ledger_rev = ledger_rev + 1,
         updated_at = now()
   where id = trip
  returning ledger_rev into v_rev;

  if v_rev is null then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;
  return v_rev;
end;
$$;

-- RPC hygiene: only signed-in users (and privileged backends) may call these.
-- (RLS would stop anon anyway — this just returns a cleaner error earlier.)
revoke execute on function public.write_state(uuid, jsonb, text, integer)   from public, anon;
revoke execute on function public.ledger_upsert_entry(uuid, jsonb)          from public, anon;
revoke execute on function public.ledger_delete_entry(uuid, text)           from public, anon;
grant  execute on function public.write_state(uuid, jsonb, text, integer)   to authenticated, service_role;
grant  execute on function public.ledger_upsert_entry(uuid, jsonb)          to authenticated, service_role;
grant  execute on function public.ledger_delete_entry(uuid, text)           to authenticated, service_role;

-- ============================================================================
-- Done. Run supabase/migrations/06-TESTPLAN.md against STAGING before prod.
-- ============================================================================
