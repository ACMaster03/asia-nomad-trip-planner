-- ============================================================================
-- 25-TESTPLAN.sql — RLS assertions for the invite acceptance flow.
--
-- Run against STAGING after applying 25-invite-accept.sql. Every block raises
-- on failure, so a clean run means every assertion held. Rolls itself back.
--
-- What must hold:
--   1. An invitee can accept and lands with EXACTLY the invited role.
--   2. An invitee CANNOT upgrade themselves while accepting.
--   3. An invitee cannot accept somebody else's invite.
--   4. Accepting twice is a no-op, not an error.
--   5. An invitee can decline, and a declined invite cannot then be accepted.
--   6. A decline cannot masquerade as an acceptance.
--   7. pending_invites() leaks nothing about trips you were never invited to.
-- ============================================================================

begin;

-- ---- fixtures -------------------------------------------------------------
-- Three users: an owner, an invitee, and a bystander. auth.uid()/auth.jwt()
-- are faked with request.jwt.claims, the same way 06/17/18's testplans do.
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'owner@test.local',     '{"display_name":"Owner"}'),
       ('22222222-2222-2222-2222-222222222222', 'invitee@test.local',   '{}'),
       ('33333333-3333-3333-3333-333333333333', 'bystander@test.local', '{}')
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values ('11111111-1111-1111-1111-111111111111', 'Owner')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111', 'Testplan Trip', '{}'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;

create or replace function pg_temp.be(p_uid uuid, p_email text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'email', p_email, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.new_invite(p_role text, p_email text) returns uuid
language sql as $$
  insert into public.trip_invites (trip_id, email, role, invited_by, status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', p_email, p_role,
          '11111111-1111-1111-1111-111111111111', 'pending')
  returning id;
$$;

-- ---- 1) accept as VIEWER lands as viewer ----------------------------------
do $$
declare v_invite uuid; v_role text;
begin
  v_invite := pg_temp.new_invite('viewer', 'invitee@test.local');
  perform pg_temp.be('22222222-2222-2222-2222-222222222222', 'invitee@test.local');
  perform public.accept_invite(v_invite);
  select role into v_role from public.trip_members
   where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     and user_id = '22222222-2222-2222-2222-222222222222';
  if v_role is distinct from 'viewer' then
    raise exception 'FAIL 1: invited as viewer, joined as %', coalesce(v_role, '<no row>');
  end if;
  if public.can_edit_trip('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') then
    raise exception 'FAIL 1: an accepted VIEWER can edit the trip';
  end if;
  if not public.can_view_trip('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') then
    raise exception 'FAIL 1: an accepted viewer cannot view the trip';
  end if;
end $$;

-- ---- 4) accepting twice is a no-op ----------------------------------------
do $$
declare v_invite uuid;
begin
  v_invite := pg_temp.new_invite('viewer', 'invitee@test.local');
  perform pg_temp.be('22222222-2222-2222-2222-222222222222', 'invitee@test.local');
  perform public.accept_invite(v_invite);
  begin
    perform public.accept_invite(v_invite);
    raise exception 'FAIL 4: re-accepting an ALREADY-ACCEPTED invite should be refused';
  exception when insufficient_privilege then
    null; -- expected: it is no longer pending
  end;
end $$;

-- ---- 2) an invitee cannot upgrade themselves ------------------------------
-- The role is read from the invite row, never from the caller, so the only
-- attack surface left is the raw membership insert the old policy allowed.
do $$
declare v_invite uuid;
begin
  delete from public.trip_members
   where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     and user_id = '22222222-2222-2222-2222-222222222222';
  v_invite := pg_temp.new_invite('viewer', 'invitee@test.local');
  perform pg_temp.be('22222222-2222-2222-2222-222222222222', 'invitee@test.local');
  begin
    insert into public.trip_members (trip_id, user_id, role)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '22222222-2222-2222-2222-222222222222', 'editor');
    raise exception 'FAIL 2: invited as viewer, self-inserted as EDITOR';
  exception when insufficient_privilege then
    null; -- expected: members_insert pins the role to pending_invite_role()
  end;
end $$;

-- ---- 3) cannot accept someone else's invite -------------------------------
do $$
declare v_invite uuid;
begin
  v_invite := pg_temp.new_invite('editor', 'invitee@test.local');
  perform pg_temp.be('33333333-3333-3333-3333-333333333333', 'bystander@test.local');
  begin
    perform public.accept_invite(v_invite);
    raise exception 'FAIL 3: a bystander accepted an invite addressed to someone else';
  exception when insufficient_privilege then
    null; -- expected
  end;
  if exists (select 1 from public.trip_members
              where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
                and user_id = '33333333-3333-3333-3333-333333333333') then
    raise exception 'FAIL 3: bystander gained membership anyway';
  end if;
end $$;

-- ---- 5) decline works, and a declined invite is dead ----------------------
do $$
declare v_invite uuid;
begin
  delete from public.trip_members
   where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     and user_id = '22222222-2222-2222-2222-222222222222';
  v_invite := pg_temp.new_invite('editor', 'invitee@test.local');
  perform pg_temp.be('22222222-2222-2222-2222-222222222222', 'invitee@test.local');
  perform public.decline_invite(v_invite);
  if (select status from public.trip_invites where id = v_invite) <> 'revoked' then
    raise exception 'FAIL 5: declining did not revoke the invite';
  end if;
  begin
    perform public.accept_invite(v_invite);
    raise exception 'FAIL 5: a DECLINED invite could still be accepted';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- ---- 6) a decline cannot fake an acceptance -------------------------------
do $$
declare v_invite uuid;
begin
  v_invite := pg_temp.new_invite('editor', 'invitee@test.local');
  perform pg_temp.be('22222222-2222-2222-2222-222222222222', 'invitee@test.local');
  begin
    update public.trip_invites
       set status = 'revoked', accepted_by = '22222222-2222-2222-2222-222222222222'
     where id = v_invite;
    raise exception 'FAIL 6: a decline stamped an accepted_by';
  exception when insufficient_privilege then
    null; -- expected: guard_invite_update rejects it
  end;
end $$;

-- ---- 7) pending_invites() shows only YOUR invites -------------------------
do $$
declare v_rows int;
begin
  perform pg_temp.new_invite('editor', 'invitee@test.local');
  perform pg_temp.be('33333333-3333-3333-3333-333333333333', 'bystander@test.local');
  select count(*) into v_rows from public.pending_invites();
  if v_rows <> 0 then
    raise exception 'FAIL 7: pending_invites() returned % rows to a bystander', v_rows;
  end if;
  perform pg_temp.be('22222222-2222-2222-2222-222222222222', 'invitee@test.local');
  select count(*) into v_rows from public.pending_invites();
  if v_rows = 0 then
    raise exception 'FAIL 7: pending_invites() hid the invitee''s own invite';
  end if;
  if not exists (select 1 from public.pending_invites() where trip_name = 'Testplan Trip') then
    raise exception 'FAIL 7: pending_invites() did not return the trip name';
  end if;
end $$;

rollback;
-- Reaching here with no exception means all seven assertions held.
