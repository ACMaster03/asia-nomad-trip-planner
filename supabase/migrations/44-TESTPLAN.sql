-- ============================================================================
-- 44-TESTPLAN.sql — the journey list: the public key can add a row and nothing
-- else, the table refuses what the form never sends, and the purge job is
-- scheduled and deletes only what is older than 12 months. Run against STAGING
-- after 44. Rolls itself back.
--
-- In the Supabase SQL editor a pass is "Success" with no error; any failure
-- stops with an error that starts "TP44 FAIL".
-- ============================================================================

begin;

-- Same role discipline as 28: the SQL editor's session owns the tables and
-- bypasses RLS, so every deny assertion needs an actual SET ROLE.
create or replace function pg_temp.anon() returns void
language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  select set_config('role', 'anon', true);
$$;
create or replace function pg_temp.god() returns void
language sql as $$ select set_config('role', 'none', true); $$;

-- ---------------------------------------------------------------------------
-- 1) The table: RLS on, one policy (insert, anon), and the grants to match.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rls boolean; v_policies int;
begin
  select c.relrowsecurity into v_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'journey_signups';
  if v_rls is null then
    raise exception 'TP44 FAIL: public.journey_signups does not exist — was 44 applied?';
  end if;
  if not v_rls then
    raise exception 'TP44 FAIL: row level security is off on journey_signups';
  end if;
  select count(*) into v_policies from pg_policies
  where schemaname = 'public' and tablename = 'journey_signups';
  if v_policies <> 1 then
    raise exception 'TP44 FAIL: expected exactly one policy (the anon insert), found %', v_policies;
  end if;
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'journey_signups'
               and (cmd <> 'INSERT' or roles <> '{anon}')) then
    raise exception 'TP44 FAIL: the one policy is not "insert, to anon"';
  end if;
  if not has_table_privilege('anon', 'public.journey_signups', 'INSERT') then
    raise exception 'TP44 FAIL: anon has no INSERT grant';
  end if;
  if has_table_privilege('anon', 'public.journey_signups', 'SELECT')
     or has_table_privilege('anon', 'public.journey_signups', 'UPDATE')
     or has_table_privilege('anon', 'public.journey_signups', 'DELETE') then
    raise exception 'TP44 FAIL: anon holds a grant beyond INSERT';
  end if;
  if has_table_privilege('authenticated', 'public.journey_signups', 'INSERT')
     or has_table_privilege('authenticated', 'public.journey_signups', 'SELECT') then
    raise exception 'TP44 FAIL: authenticated holds a grant on the list';
  end if;
  raise notice 'TP44 OK (1/5): RLS on, one insert policy for anon, grants to match';
end $$;

-- ---------------------------------------------------------------------------
-- 2) As anon: a valid row goes in; an answer off the list and an answer over
--    its limit do not.
-- ---------------------------------------------------------------------------
do $$
begin
  perform pg_temp.anon();
  insert into public.journey_signups
    ("when", length, plan_today, first_name, email, call_ok, source, consent_text_version, submitted_at)
  values
    ('next_3_months', '3_6_months', 'A shared sheet', 'Anna', 'anna@tp44.local', true, 'direct', '2026-10-01', now());

  begin
    insert into public.journey_signups ("when", length, email, consent_text_version, submitted_at)
    values ('tomorrow', '3_6_months', 'b@tp44.local', '2026-10-01', now());
    raise exception 'TP44 FAIL: an answer off the list was accepted for "when"';
  exception when check_violation then null;
  end;

  begin
    insert into public.journey_signups ("when", length, email, consent_text_version, submitted_at, first_name)
    values ('later', 'open_ended', 'c@tp44.local', '2026-10-01', now(), repeat('x', 81));
    raise exception 'TP44 FAIL: an 81-character first name was accepted';
  exception when check_violation then null;
  end;

  perform pg_temp.god();
  if (select count(*) from public.journey_signups where email = 'anna@tp44.local') <> 1 then
    raise exception 'TP44 FAIL: the valid row did not land';
  end if;
  raise notice 'TP44 OK (2/5): anon adds a valid row; the constraints refuse the rest';
end $$;

-- ---------------------------------------------------------------------------
-- 3) As anon: the list cannot be read, changed or emptied. Either the grant is
--    missing (permission denied) or RLS hides every row; both are a pass.
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
begin
  perform pg_temp.anon();
  begin
    select count(*) into n from public.journey_signups;
    if n > 0 then
      raise exception 'TP44 FAIL: anon can read % row(s) of the list', n;
    end if;
  exception when insufficient_privilege then null;
  end;
  begin
    update public.journey_signups set first_name = 'X' where email = 'anna@tp44.local';
    get diagnostics n = row_count;
    if n > 0 then
      raise exception 'TP44 FAIL: anon changed a row';
    end if;
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.journey_signups where email = 'anna@tp44.local';
    get diagnostics n = row_count;
    if n > 0 then
      raise exception 'TP44 FAIL: anon deleted a row';
    end if;
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.god();
  if (select count(*) from public.journey_signups
      where email = 'anna@tp44.local' and first_name = 'Anna') <> 1 then
    raise exception 'TP44 FAIL: the row changed or vanished under anon';
  end if;
  raise notice 'TP44 OK (3/5): anon cannot read, change or delete';
end $$;

-- ---------------------------------------------------------------------------
-- 4) The purge job: scheduled daily, and its command is the 12-month delete.
-- ---------------------------------------------------------------------------
do $$
declare
  cmd text; sched text;
begin
  select command, schedule into cmd, sched from cron.job where jobname = 'journey-signups-purge-daily';
  if cmd is null then
    raise exception 'TP44 FAIL: journey-signups-purge-daily is not scheduled';
  end if;
  if cmd not like '%journey_signups%' or cmd not like '%12 months%' then
    raise exception 'TP44 FAIL: the purge job is not the 12-month delete on journey_signups: %', cmd;
  end if;
  if sched <> '0 3 * * *' then
    raise exception 'TP44 FAIL: the purge job runs at "%", not daily at 03:00 UTC', sched;
  end if;
  raise notice 'TP44 OK (4/5): the purge job is scheduled daily';
end $$;

-- ---------------------------------------------------------------------------
-- 5) The job's statement, run here: a row 13 months old goes, one 11 months
--    old stays.
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.journey_signups ("when", length, email, consent_text_version, submitted_at, created_at)
  values
    ('someday', '1_3_months', 'old@tp44.local',    '2026-10-01', now() - interval '13 months', now() - interval '13 months'),
    ('someday', '1_3_months', 'recent@tp44.local', '2026-10-01', now() - interval '11 months', now() - interval '11 months');

  delete from public.journey_signups where created_at < now() - interval '12 months';

  if exists (select 1 from public.journey_signups where email = 'old@tp44.local') then
    raise exception 'TP44 FAIL: a 13-month-old row survived the purge';
  end if;
  if not exists (select 1 from public.journey_signups where email = 'recent@tp44.local') then
    raise exception 'TP44 FAIL: an 11-month-old row was purged';
  end if;
  raise notice 'TP44 OK (5/5): the purge keeps 12 months and no more';
end $$;

rollback;
