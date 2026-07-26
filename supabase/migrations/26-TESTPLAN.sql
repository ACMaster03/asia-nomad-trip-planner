-- ============================================================================
-- 26-TESTPLAN.sql — assertions for trip deletion, leaving, and account erasure.
--
-- Run against STAGING after applying 26-account-deletion.sql. Every block
-- raises on failure; a clean run means every assertion held. Rolls itself back.
--
-- What must hold:
--   1. Only the OWNER can delete a trip (an editor's delete removes nothing).
--   2. Deleting a trip cascades everything trip-scoped away.
--   3. A member can remove themselves, and only themselves.
--   4. delete_my_account() erases the caller and the trips they own...
--   5. ...but leaves trips they merely JOINED standing.
--   6. The four non-cascading FKs to auth.users do not block the delete —
--      this is the one that fails loudly in prod if it is ever regressed.
--   7. delete_my_account() refuses an anonymous caller.
-- ============================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'owner@tp26.local',  '{}'),
       ('22222222-2222-2222-2222-222222222222', 'member@tp26.local', '{}'),
       ('33333333-3333-3333-3333-333333333333', 'other@tp26.local',  '{}')
on conflict (id) do nothing;

-- Faking the JWT claims alone is NOT enough: the SQL Editor / Management API
-- runs as a table-owning role, and table owners bypass RLS entirely. The
-- "must be blocked" assertions below only mean something under SET ROLE
-- authenticated, so be() switches role as well as claims, and god() drops
-- back to the privileged login role for fixtures and state assertions.
create or replace function pg_temp.be(p_uid uuid, p_email text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'email', p_email, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create or replace function pg_temp.god() returns void
language sql as $$ select set_config('role', 'none', true); $$;
create or replace function pg_temp.anon() returns void
language sql as $$
  select set_config('request.jwt.claims', '', true);
  select set_config('role', 'authenticated', true);
$$;

-- owner's trip, with a member and some child rows
insert into public.trips (id, owner, name, state, ledger)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111', 'Doomed Trip', '{}'::jsonb, '[]'::jsonb),
       -- a trip owned by SOMEONE ELSE that the owner has merely joined
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '33333333-3333-3333-3333-333333333333', 'Survivor Trip', '{}'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;

insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'editor')
on conflict do nothing;

insert into public.trip_events (id, trip_id, author, kind, payload)
values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111', 'note', '{"text":"hi"}'::jsonb);

-- ---- 1) a non-owner cannot delete the trip --------------------------------
do $$
begin
  perform pg_temp.be('22222222-2222-2222-2222-222222222222', 'member@tp26.local');
  delete from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.god();
  if not exists (select 1 from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') then
    raise exception 'FAIL 1: an EDITOR deleted a trip they do not own';
  end if;
end $$;

-- ---- 3) a member can remove only themselves -------------------------------
do $$
begin
  perform pg_temp.be('22222222-2222-2222-2222-222222222222', 'member@tp26.local');
  -- somebody else's seat: must not budge
  delete from public.trip_members
   where trip_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     and user_id = '11111111-1111-1111-1111-111111111111';
  perform pg_temp.god();  -- the member cannot SEE bbbb's rows either way
  if not exists (select 1 from public.trip_members
                  where trip_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
                    and user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'FAIL 3: a member removed SOMEONE ELSE from a trip';
  end if;
  -- their own seat: must go
  perform pg_temp.be('22222222-2222-2222-2222-222222222222', 'member@tp26.local');
  delete from public.trip_members
   where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     and user_id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.god();
  if exists (select 1 from public.trip_members
              where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
                and user_id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'FAIL 3: a member could not leave a trip';
  end if;
end $$;

-- ---- 2) the owner CAN delete, and children go with it ---------------------
do $$
declare v_events int;
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111111', 'owner@tp26.local');
  delete from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.god();
  if exists (select 1 from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') then
    raise exception 'FAIL 2: the owner could not delete their own trip';
  end if;
  select count(*) into v_events from public.trip_events
   where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if v_events <> 0 then
    raise exception 'FAIL 2: % trip_events survived the trip', v_events;
  end if;
end $$;

-- ---- 6) the non-cascading FKs must not block the account delete -----------
-- Rebuild an owner-owned trip and plant a row against EVERY reference that has
-- no ON DELETE action: trip_invites.invited_by / .accepted_by, ledger.created_by
-- and cities.owner. If delete_my_account() ever stops clearing one of these,
-- this block fails with a foreign_key_violation instead of prod doing it.
do $$
begin
  perform pg_temp.god();  -- fixture writes run privileged
  insert into public.trips (id, owner, name, state, ledger)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
          '11111111-1111-1111-1111-111111111111', 'FK Trip', '{}'::jsonb, '[]'::jsonb);

  -- invited_by = the doomed user, on a trip owned by SOMEONE ELSE, so it is not
  -- swept away by the trip cascade.
  insert into public.trip_invites (trip_id, email, role, invited_by, status)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'x@tp26.local', 'viewer',
          '11111111-1111-1111-1111-111111111111', 'pending');
  -- accepted_by = the doomed user, likewise on the surviving trip
  insert into public.trip_invites (trip_id, email, role, invited_by, status, accepted_by, accepted_at)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner@tp26.local', 'editor',
          '33333333-3333-3333-3333-333333333333', 'accepted',
          '11111111-1111-1111-1111-111111111111', now());

  if to_regclass('public.ledger') is not null then
    insert into public.ledger (trip_id, entry_date, type, amount, created_by)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date, 'expense', 1,
            '11111111-1111-1111-1111-111111111111');
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='cities' and column_name='owner') then
    execute 'insert into public.cities (city, owner) values ($1, $2)'
      using 'Testville', '11111111-1111-1111-1111-111111111111';
  end if;
end $$;

-- ---- 4/5) erase the account -----------------------------------------------
do $$
begin
  perform pg_temp.be('11111111-1111-1111-1111-111111111111', 'owner@tp26.local');
  perform public.delete_my_account();

  perform pg_temp.god();  -- authenticated may not even SELECT auth.users
  if exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'FAIL 4: the auth.users row survived delete_my_account()';
  end if;
  if exists (select 1 from public.trips where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') then
    raise exception 'FAIL 4: a trip OWNED by the deleted user survived';
  end if;
  if exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'FAIL 4: the profiles row survived';
  end if;
  -- 5) someone else's trip must be untouched, minus the deleted user's seat
  if not exists (select 1 from public.trips where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'FAIL 5: deleting an account destroyed a trip owned by someone ELSE';
  end if;
  if exists (select 1 from public.trip_members
              where trip_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
                and user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'FAIL 5: the deleted user kept their seat on a joined trip';
  end if;
end $$;

-- ---- 7) anonymous callers are refused -------------------------------------
do $$
begin
  perform pg_temp.anon();
  begin
    perform public.delete_my_account();
    raise exception 'FAIL 7: delete_my_account() ran for an anonymous caller';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

rollback;
-- Reaching here with no exception means all seven assertions held.
