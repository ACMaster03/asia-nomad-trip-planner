-- ============================================================================
-- 26-account-deletion.sql — GDPR account deletion, and the trip danger zone.
--
-- Deleting a TRIP needs nothing new: trips_delete (schema.sql) already allows
-- `owner = auth.uid()`, and every trip-scoped table cascades from trips.id.
-- Leaving a trip needs nothing either — members_delete already allows removing
-- yourself. Both are plain client deletes; see lib/trips/danger.ts.
--
-- Deleting an ACCOUNT is the part that cannot be done from the client at all:
-- auth.users is not reachable with the anon key. The alternative to the
-- function below is a Next route handler holding SUPABASE_SERVICE_ROLE_KEY,
-- which would put a full-bypass credential into the Vercel app for the first
-- time. This keeps that property: the service key stays out of the web app,
-- and the only privileged operation lives here, in one auditable function that
-- can only ever delete the CALLER'S own account.
--
-- ⚠️ STORAGE IS NOT COVERED BY ANY OF THIS. Deleting rows in SQL does not
-- delete objects in the trip-media bucket, and orphaned objects still count
-- against the 1 GB free tier. The client purges them BEFORE calling any of
-- this, while can_edit_trip is still true — see purgeTripMedia(). Ordering is
-- not cosmetic: once the trip row is gone the storage policies deny the
-- delete, and the files are stranded permanently.
--
-- Idempotent, additive-only. Depends on 02 (invites), 06 (guard trigger).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- delete_my_account() — erase the caller.
--
-- The FK graph decides the order. Most references to auth.users cascade
-- (trips.owner, trip_members.user_id, trip_events.author, trip_shares.
-- created_by, profiles.id) or null out (places.created_by), but FOUR do
-- neither, and any one of them would abort the whole delete with a foreign-key
-- violation if left alone:
--
--   trip_invites.invited_by   NOT NULL, no action  -> rows must be deleted
--   trip_invites.accepted_by  nullable,  no action -> rows must be deleted too
--   ledger.created_by         nullable,  no action -> nulled (dormant table)
--   cities.owner              nullable,  no action -> nulled (user-added rows)
--
-- trip_invites is DELETED rather than nulled on purpose. Nulling accepted_by
-- would be an UPDATE on trip_invites, which fires 06's guard_invite_update
-- trigger — and for an accepted row the trigger's strict branch refuses it
-- (old.status <> 'pending'). DELETE has no such trigger, and an invite record
-- naming a person who no longer exists is exactly the personal data a deletion
-- request is asking us to remove.
--
-- ledger and cities are touched through dynamic SQL because neither is
-- guaranteed: ledger is the dormant normalized table the document model
-- replaced, and public.cities has two competing definitions across schema.sql
-- and 03-catalogue.sql, only one of which carries an `owner` column.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- 1) Trips they OWN. Cascades to segments/stays/transport/extras/notes/
  --    ledger/trip_members/trip_invites/trip_events/check_ins/trip_shares/
  --    push_subscriptions/digest subscribers, and nulls other users'
  --    profiles.active_trip_id (migration 07's on delete set null).
  delete from public.trips where owner = v_uid;

  -- 2) Their seat on OTHER people's trips.
  delete from public.trip_members where user_id = v_uid;

  -- 3) Invite rows naming them, on trips that still exist.
  delete from public.trip_invites
   where invited_by = v_uid
      or accepted_by = v_uid
      or (v_email is not null and lower(email) = v_email);

  -- 4) The two nullable no-action references, if those tables/columns exist.
  if to_regclass('public.ledger') is not null then
    execute 'update public.ledger set created_by = null where created_by = $1' using v_uid;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'cities' and column_name = 'owner'
  ) then
    execute 'update public.cities set owner = null where owner = $1' using v_uid;
  end if;

  -- 5) The account itself. profiles.id cascades from here.
  delete from auth.users where id = v_uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
