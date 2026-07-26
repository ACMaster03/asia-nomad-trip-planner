-- ============================================================================
-- 25-invite-accept.sql — let an invited user actually JOIN the trip.
--
-- Migration 02 built the whole invite mechanism: a trip_invites row, a
-- pending_invite_role() lookup, a members_insert policy that lets an invitee
-- add THEMSELVES with exactly the invited role, and (in 06) a guard trigger
-- allowing precisely one transition — pending -> accepted, no field changes.
--
-- What was never built is the other end of it: NOTHING anywhere inserts into
-- trip_members. createInvite() wrote a row that no code path ever consumed, so
-- no co-editor and no viewer could join a trip through the app at all, and the
-- viewer role shipped in the UI was unreachable without hand-written SQL.
--
-- Two functions close that:
--   pending_invites() — what am I invited to? The invitee cannot SELECT the
--     trip yet (can_view_trip is false until they are a member), so the trip's
--     NAME has to come from a definer function or the banner would have to say
--     "someone invited you to a trip".
--   accept_invite()  — join, atomically.
--
-- Idempotent, additive-only. Depends on 02 (trip_invites), 06 (guard trigger).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) What am I invited to?
--
-- SECURITY DEFINER to cross two RLS boundaries the invitee has not earned yet
-- (trips, profiles) — but it returns ONLY rows addressed to the caller's own
-- verified email, and only three sanitized columns from each. It must never
-- grow a column that leaks the trip itself (state, ledger, dates, route): a
-- pending invite is not access, and someone who never accepts must learn
-- nothing beyond "X invited me to a trip called Y".
-- ---------------------------------------------------------------------------
create or replace function public.pending_invites()
returns table (
  invite_id       uuid,
  trip_id         uuid,
  trip_name       text,
  role            text,
  invited_by_name text,
  created_at      timestamptz
)
language sql security definer stable set search_path = public as $$
  select i.id,
         i.trip_id,
         t.name,
         i.role,
         coalesce(nullif(p.display_name, ''), 'Someone'),
         i.created_at
    from public.trip_invites i
    join public.trips        t on t.id = i.trip_id
    left join public.profiles p on p.id = i.invited_by
   where auth.uid() is not null
     and i.status = 'pending'
     and lower(i.email) = lower(auth.jwt() ->> 'email')
   order by i.created_at desc;
$$;
revoke all on function public.pending_invites() from public, anon;
grant execute on function public.pending_invites() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Accept one.
--
-- ORDER IS LOAD-BEARING: the membership row must be inserted BEFORE the invite
-- is marked accepted. members_insert authorises the self-insert via
-- pending_invite_role(trip_id), which only sees invites whose status is still
-- 'pending' — flipping the status first would make the role lookup return null
-- and the insert would be refused. Doing both here, in one statement pair,
-- also removes the half-accepted state a two-round-trip client could leave
-- behind (a member row with the invite still showing as pending, or worse).
--
-- SECURITY DEFINER, so this function is the one enforcing the rules the
-- policies would otherwise enforce. It therefore re-checks them itself:
--   * the caller is signed in,
--   * the invite is still pending,
--   * and it is addressed to the caller's own verified email.
-- The role is taken from the INVITE ROW, never from an argument, so this
-- cannot become a way to pick your own role.
--
-- The UPDATE still fires 06's guard_invite_update trigger, and passes it on
-- both paths: an editor satisfies its can_edit_trip early-out (the membership
-- row already exists by then), and a viewer satisfies the strict branch —
-- pending -> accepted, accepted_by = auth.uid(), nothing else touched.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite(p_invite uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.trip_invites;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_invite
    from public.trip_invites
   where id = p_invite
     and status = 'pending'
     and lower(email) = lower(auth.jwt() ->> 'email');

  -- Deliberately the same error for "no such invite", "already accepted",
  -- "revoked" and "addressed to someone else": a wrong guess must not be able
  -- to tell an invite id apart from a non-existent one.
  if not found then
    raise exception 'no pending invite for you with that id' using errcode = '42501';
  end if;

  -- Re-accepting is a no-op rather than an error: a double-tap on a phone with
  -- a slow connection should not look like a failure. A re-invite that changed
  -- the role (viewer -> editor) applies here too.
  insert into public.trip_members (trip_id, user_id, role)
  values (v_invite.trip_id, auth.uid(), v_invite.role)
      on conflict (trip_id, user_id) do update set role = excluded.role;

  update public.trip_invites
     set status      = 'accepted',
         accepted_by = auth.uid()   -- accepted_at is stamped by the 06 trigger
   where id = p_invite;

  return v_invite.trip_id;
end $$;
revoke all on function public.accept_invite(uuid) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Widen the guard trigger by exactly one transition: pending -> revoked,
--    performed by the addressed invitee. That is DECLINING.
--
--    06 allowed an invitee precisely one move (pending -> accepted), so an
--    unwanted invite could never be cleared by the person who received it and
--    the banner would nag forever. Declining is not an escalation — it only
--    ever removes the invitee's own opportunity.
--
--    Everything 06 protected is preserved, and the immutability checks are now
--    hoisted so they apply to BOTH transitions rather than only to acceptance:
--    role, email, trip_id, invited_by and id still cannot move, the source
--    status must still be 'pending', an acceptance must still stamp
--    accepted_by = auth.uid(), and a decline may not fake one.
--
--    'revoked' is reused rather than adding a 'declined' state: status carries
--    a CHECK constraint, and widening it would be a breaking change for a
--    distinction nothing reads. The inviter sees the invite disappear either
--    way.
-- ---------------------------------------------------------------------------
create or replace function public.guard_invite_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Privileged contexts (SQL Editor / service_role) and trip editors/owner may
  -- update invites freely (e.g. revoke). Unchanged from 06.
  if auth.uid() is null or public.can_edit_trip(old.trip_id) then
    return new;
  end if;

  -- Anyone else reaching this row is the addressed invitee (per the policy).
  -- Nothing about WHICH invite this is may change, on any transition.
  if new.id         is distinct from old.id
     or new.role       is distinct from old.role
     or new.email      is distinct from old.email
     or new.trip_id    is distinct from old.trip_id
     or new.invited_by is distinct from old.invited_by then
    raise exception 'invitees may not change an invite, only answer it'
      using errcode = '42501';
  end if;

  if old.status <> 'pending' then
    raise exception 'invitees may only answer a PENDING invite'
      using errcode = '42501';
  end if;

  if new.status = 'accepted' then
    if new.accepted_by is distinct from auth.uid() then
      raise exception 'an acceptance must be stamped with the accepting user'
        using errcode = '42501';
    end if;
    new.accepted_at := now();  -- server clock, never the client's
  elsif new.status = 'revoked' then
    -- Declining must not masquerade as an acceptance.
    if new.accepted_by is distinct from old.accepted_by
       or new.accepted_at is distinct from old.accepted_at then
      raise exception 'a declined invite may not claim an acceptance'
        using errcode = '42501';
    end if;
  else
    raise exception 'invitees may only accept or decline their own invite'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
drop trigger if exists invites_guard_update on public.trip_invites;
create trigger invites_guard_update
  before update on public.trip_invites
  for each row execute function public.guard_invite_update();

-- ---------------------------------------------------------------------------
-- 4) Decline, on top of the widened trigger.
-- ---------------------------------------------------------------------------
create or replace function public.decline_invite(p_invite uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.trip_invites
     set status = 'revoked'
   where id = p_invite
     and status = 'pending'
     and lower(email) = lower(auth.jwt() ->> 'email');
  if not found then
    raise exception 'no pending invite for you with that id' using errcode = '42501';
  end if;
end $$;
revoke all on function public.decline_invite(uuid) from public, anon;
grant execute on function public.decline_invite(uuid) to authenticated;
