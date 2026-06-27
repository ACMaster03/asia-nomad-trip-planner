-- Migration 02 — in-app invites.
-- Invite a collaborator by email; when they sign in with that email they can accept
-- and join the trip. Works entirely with the anon key + RLS (no server, no service_role).
-- Run in Supabase → SQL Editor. Safe to run more than once.

-- 1) Pending/accepted invitations, keyed by the invitee's email.
create table if not exists public.trip_invites (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  email       text not null,
  role        text not null default 'editor' check (role in ('editor','viewer')),
  invited_by  uuid not null references auth.users(id),
  status      text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);
create index if not exists trip_invites_email_idx on public.trip_invites (lower(email), status);
create index if not exists trip_invites_trip_idx  on public.trip_invites (trip_id);

-- 2) Does the signed-in user have a pending invite to this trip?
--    SECURITY DEFINER so it bypasses RLS internally (no policy recursion).
create or replace function public.has_pending_invite(t uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.trip_invites i
    where i.trip_id = t and i.status = 'pending'
      and lower(i.email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- 3) RLS on invites.
alter table public.trip_invites enable row level security;

drop policy if exists invites_select on public.trip_invites;
create policy invites_select on public.trip_invites for select
  using ( public.can_access_trip(trip_id) or lower(email) = lower(auth.jwt() ->> 'email') );

drop policy if exists invites_insert on public.trip_invites;
create policy invites_insert on public.trip_invites for insert
  with check ( public.can_access_trip(trip_id) and invited_by = auth.uid() );

-- trip members can revoke; the invitee can mark their own invite accepted
drop policy if exists invites_update on public.trip_invites;
create policy invites_update on public.trip_invites for update
  using ( public.can_access_trip(trip_id) or lower(email) = lower(auth.jwt() ->> 'email') );

-- 4) Let an invited user add THEMSELVES to trip_members (owner can still add anyone).
drop policy if exists members_all    on public.trip_members;
drop policy if exists members_select on public.trip_members;
drop policy if exists members_insert on public.trip_members;
drop policy if exists members_delete on public.trip_members;

create policy members_select on public.trip_members for select
  using ( public.can_access_trip(trip_id) );

create policy members_insert on public.trip_members for insert
  with check (
    exists (select 1 from public.trips where id = trip_id and owner = auth.uid())
    or ( user_id = auth.uid() and public.has_pending_invite(trip_id) )
  );

create policy members_delete on public.trip_members for delete
  using (
    exists (select 1 from public.trips where id = trip_id and owner = auth.uid())
    or user_id = auth.uid()   -- you can always remove yourself
  );
