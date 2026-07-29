-- ============================================================================
-- 27-TESTPLAN.sql — assertions for traveller push subscriptions + prefs.
--
-- Run against STAGING after applying 27-traveller-push.sql. Every block raises
-- on failure; a clean run means every assertion held. Rolls itself back.
--
-- What must hold:
--   1. A user can register a device for THEMSELVES, and sees only their own.
--   2. A user cannot register a device for someone else (RLS with check).
--   3. A user cannot read, steal (update user_id via upsert path) or delete
--      another user's subscription.
--   4. The webpush shape is enforced (missing keys refused); apns without
--      keys is accepted (the SwiftUI companion's row shape).
--   5. Users can flip their OWN notify prefs; not another user's row.
--   6. is_admin stays guarded even though prefs are now updatable.
--   7. Deleting the auth user cascades their subscriptions away.
-- ============================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111127', 'petra@tp27.local',  '{}'),
       ('22222222-2222-2222-2222-222222222227', 'patrik@tp27.local', '{}')
on conflict (id) do nothing;

-- Same role discipline as 26-TESTPLAN: claims alone are not enough, the
-- editor's login role owns the tables and bypasses RLS — SET ROLE authenticated
-- is what makes the deny assertions meaningful.
create or replace function pg_temp.be(p_uid uuid, p_email text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'email', p_email, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create or replace function pg_temp.god() returns void
language sql as $$ select set_config('role', 'none', true); $$;

-- ---------------------------------------------------------------------------
-- 1. self-registration works; self-visibility only
-- ---------------------------------------------------------------------------
select pg_temp.be('11111111-1111-1111-1111-111111111127', 'petra@tp27.local');

insert into public.user_push_subscriptions (user_id, endpoint, p256dh, auth)
values ('11111111-1111-1111-1111-111111111127', 'https://push.example/ep-petra', 'k1', 'a1');

do $$ begin
  if (select count(*) from public.user_push_subscriptions) <> 1 then
    raise exception 'TP27-1 FAIL: petra should see exactly her own subscription';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. cannot register a device for someone else
-- ---------------------------------------------------------------------------
do $$ begin
  begin
    insert into public.user_push_subscriptions (user_id, endpoint, p256dh, auth)
    values ('22222222-2222-2222-2222-222222222227', 'https://push.example/ep-forged', 'k', 'a');
    raise exception 'TP27-2 FAIL: inserting a subscription for another user was allowed';
  exception when insufficient_privilege or check_violation then null; -- expected (42501)
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. the other user: invisible, undeletable, unstealable
-- ---------------------------------------------------------------------------
select pg_temp.be('22222222-2222-2222-2222-222222222227', 'patrik@tp27.local');

do $$ begin
  if (select count(*) from public.user_push_subscriptions) <> 0 then
    raise exception 'TP27-3a FAIL: patrik can see petra''s subscription';
  end if;
end $$;

delete from public.user_push_subscriptions where endpoint = 'https://push.example/ep-petra';
update public.user_push_subscriptions
  set user_id = '22222222-2222-2222-2222-222222222227'
  where endpoint = 'https://push.example/ep-petra';

select pg_temp.god();
do $$ begin
  if (select user_id from public.user_push_subscriptions
      where endpoint = 'https://push.example/ep-petra')
     <> '11111111-1111-1111-1111-111111111127' then
    raise exception 'TP27-3b FAIL: petra''s subscription was deleted or stolen';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. shape constraint: webpush needs keys; apns does not
-- ---------------------------------------------------------------------------
select pg_temp.be('22222222-2222-2222-2222-222222222227', 'patrik@tp27.local');

do $$ begin
  begin
    insert into public.user_push_subscriptions (user_id, endpoint) -- webpush, no keys
    values ('22222222-2222-2222-2222-222222222227', 'https://push.example/ep-broken');
    raise exception 'TP27-4a FAIL: webpush subscription without keys was accepted';
  exception when check_violation then null; -- expected
  end;
end $$;

insert into public.user_push_subscriptions (user_id, transport, endpoint)
values ('22222222-2222-2222-2222-222222222227', 'apns', 'devicetoken-abc123');

-- ---------------------------------------------------------------------------
-- 5. prefs: own row flips; the other row does not
-- ---------------------------------------------------------------------------
update public.profiles set notify_event_push = false
  where id = '22222222-2222-2222-2222-222222222227';
update public.profiles set notify_deadline_push = false
  where id = '11111111-1111-1111-1111-111111111127'; -- silently matches 0 rows under RLS

select pg_temp.god();
do $$ begin
  if (select notify_event_push from public.profiles
      where id = '22222222-2222-2222-2222-222222222227') then
    raise exception 'TP27-5a FAIL: patrik''s own pref did not flip';
  end if;
  if not (select notify_deadline_push from public.profiles
          where id = '11111111-1111-1111-1111-111111111127') then
    raise exception 'TP27-5b FAIL: patrik changed petra''s pref';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. is_admin still guarded despite the update policy carrying the new columns
-- ---------------------------------------------------------------------------
select pg_temp.be('22222222-2222-2222-2222-222222222227', 'patrik@tp27.local');
-- The guard may refuse either way: column revoke (42501) or the
-- guard_profile_admin_flag trigger (P0001 raise_exception). Our own FAIL is
-- ALSO P0001, so it must be raised OUTSIDE the handler that treats P0001 as
-- success — hence the flag, not a raise inside the inner block.
do $$
declare v_blocked boolean := false;
begin
  begin
    update public.profiles set is_admin = true
      where id = '22222222-2222-2222-2222-222222222227';
  exception when insufficient_privilege or raise_exception then v_blocked := true; -- expected
  end;
  if not v_blocked then
    raise exception 'TP27-6 FAIL: is_admin update was not refused';
  end if;
end $$;

-- belt over braces: whatever the refusal path, the flag must still be false
select pg_temp.god();
do $$ begin
  if (select is_admin from public.profiles
      where id = '22222222-2222-2222-2222-222222222227') then
    raise exception 'TP27-6b FAIL: is_admin is true despite the refusal';
  end if;
end $$;
select pg_temp.be('22222222-2222-2222-2222-222222222227', 'patrik@tp27.local');

-- ---------------------------------------------------------------------------
-- 7. account deletion cascades subscriptions
-- ---------------------------------------------------------------------------
select pg_temp.god();
delete from auth.users where id = '11111111-1111-1111-1111-111111111127';
do $$ begin
  if exists (select 1 from public.user_push_subscriptions
             where endpoint = 'https://push.example/ep-petra') then
    raise exception 'TP27-7 FAIL: deleting the user left the subscription behind';
  end if;
end $$;

rollback;
