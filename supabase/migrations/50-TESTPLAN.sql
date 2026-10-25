-- ============================================================================
-- 50-TESTPLAN.sql — the reminder-email switch (#150).
-- Production only since 25 Oct: run it inside the rolled-back dry run of 50
-- (begin; + 50 + this file without its begin;). It makes its own tp50 users,
-- reads back only those, and rolls itself back.
--
-- A pass is "Success" with no error; any failure stops with an error that
-- starts "TP50 FAIL".
-- ============================================================================

begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111150', 'ann@tp50.local', now(), '{"first_name":"Ann"}'),
  ('22222222-2222-2222-2222-222222222250', 'bob@tp50.local', now(), '{"first_name":"Bob"}')
on conflict (id) do nothing;

create or replace function pg_temp.be(p_uid uuid, p_email text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'email', p_email, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create or replace function pg_temp.god() returns void
language sql as $$ select set_config('role', 'none', true); $$;

do $$
declare
  c_ann constant uuid := '11111111-1111-1111-1111-111111111150';
  c_bob constant uuid := '22222222-2222-2222-2222-222222222250';
  v     boolean;
  v_n   int;
begin
  -- 1) A new row without the column says true.
  perform pg_temp.be(c_ann, 'ann@tp50.local');
  insert into public.notify_prefs (user_id, deadline_push) values (c_ann, true);
  select deadline_email into v from public.notify_prefs where user_id = c_ann;
  if v is distinct from true then
    perform pg_temp.god();
    raise exception 'TP50 FAIL: a new row reads deadline_email = %', v;
  end if;

  -- 2) The person switches it off, as the web's whole-row upsert does.
  insert into public.notify_prefs (user_id, deadline_push, own_trip_posts, follow_posts,
                                   comments_on_mine, replies, reactions, deadline_email)
  values (c_ann, true, true, true, true, true, false, false)
  on conflict (user_id) do update set
    deadline_push = excluded.deadline_push, own_trip_posts = excluded.own_trip_posts,
    follow_posts = excluded.follow_posts, comments_on_mine = excluded.comments_on_mine,
    replies = excluded.replies, reactions = excluded.reactions,
    deadline_email = excluded.deadline_email;
  select deadline_email into v from public.notify_prefs where user_id = c_ann;
  if v is distinct from false then
    perform pg_temp.god();
    raise exception 'TP50 FAIL: switching off did not stick: %', v;
  end if;

  -- 3) An upsert that does not name the column (the iPhone app today) keeps it off.
  insert into public.notify_prefs (user_id, deadline_push, reactions)
  values (c_ann, false, true)
  on conflict (user_id) do update set
    deadline_push = excluded.deadline_push, reactions = excluded.reactions;
  select deadline_email into v from public.notify_prefs where user_id = c_ann;
  if v is distinct from false then
    perform pg_temp.god();
    raise exception 'TP50 FAIL: an upsert without the column turned it back to %', v;
  end if;

  -- 4) Someone else can neither see nor change Ann's switch.
  perform pg_temp.be(c_bob, 'bob@tp50.local');
  select count(*) into v_n from public.notify_prefs where user_id = c_ann;
  if v_n <> 0 then
    perform pg_temp.god();
    raise exception 'TP50 FAIL: Bob can see Ann''s row';
  end if;
  update public.notify_prefs set deadline_email = true where user_id = c_ann;
  perform pg_temp.god();
  select deadline_email into v from public.notify_prefs where user_id = c_ann;
  if v is distinct from false then
    raise exception 'TP50 FAIL: Bob turned Ann''s switch back on';
  end if;

  -- 5) What the functions read (service role, here the owner): Ann off, Bob
  --    (no row) treated as on.
  select count(*) into v_n from public.notify_prefs
   where user_id in (c_ann, c_bob) and deadline_email = false;
  if v_n <> 1 then
    raise exception 'TP50 FAIL: % tp50 rows say off, not 1', v_n;
  end if;
end $$;

rollback;
