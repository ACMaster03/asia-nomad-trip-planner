-- ============================================================================
-- 44-journey-signups.sql — the list form on journey.livhold.com (1 Oct 2026).
--
-- The landing page, hosted outside this repo under journey.livhold.com, asks
-- people who are not packing yet when they leave, for how long, how they plan
-- today, their email and, if they like, a first name and whether they are up
-- for a 20-minute call. The answers arrive through the app's
-- /api/journey-signup route (product/src/app/api/journey-signup/route.ts),
-- which inserts with the PUBLIC key. The paste-ready form, the brief and the
-- paste instructions are in docs/landing-form/.
--
-- INSERT-ONLY FOR THE PUBLIC KEY. RLS is on, the only policy is an insert for
-- anon, and the table-level grants say the same: the key shipped in every
-- client can add a row and never read, change or remove one, so a leaked key
-- yields no list. The list is read in the Supabase dashboard (service role).
--
-- `when` is a reserved word in SQL, hence the quotes, here and in every query
-- that ever touches the column. The allowed answers are the form's values,
-- verbatim; product/src/lib/journey/signup.ts holds the same two lists, so a
-- change on one side is a change on both.
--
-- RETENTION: 12 MONTHS, THEN GONE. The privacy policy (product/src/app/privacy/
-- page.tsx, "If you join the list on journey.livhold.com") promises "deleted 12
-- months after you send them, or sooner if you ask"; the daily job below is
-- what keeps that promise, so the two numbers change together. The job runs as
-- its owner (postgres), which RLS does not bind. created_at is the server's
-- clock; submitted_at is the visitor's, kept for the record.
--
-- pg_cron is on since 08. cron.schedule() upserts by name, so this file is
-- idempotent end to end. Staging first, then 44-TESTPLAN.sql there.
-- ============================================================================

create table if not exists public.journey_signups (
  id                   uuid primary key default gen_random_uuid(),
  "when"               text not null check ("when" in ('on_the_move','next_3_months','later','someday')),
  length               text not null check (length in ('1_3_months','3_6_months','6_plus_months','open_ended')),
  plan_today           text check (char_length(plan_today) <= 1000),
  first_name           text check (char_length(first_name) <= 80),
  email                text not null check (char_length(email) <= 200),
  call_ok              boolean not null default false,
  source               text check (char_length(source) <= 200),
  consent_text_version text not null check (char_length(consent_text_version) <= 40),
  submitted_at         timestamptz not null,
  created_at           timestamptz not null default now()
);

comment on table public.journey_signups is
  'The journey.livhold.com list form (docs/landing-form). Insert-only for anon, via /api/journey-signup. Rows are purged 12 months after created_at (journey-signups-purge-daily), as /privacy promises.';

alter table public.journey_signups enable row level security;

-- Belt and braces: the policy below is the only way in, and the grants make
-- sure that a select policy added by mistake one day could not open a way out.
revoke all on public.journey_signups from anon, authenticated;
grant insert on public.journey_signups to anon;

drop policy if exists "anon can insert" on public.journey_signups;
create policy "anon can insert" on public.journey_signups
  for insert to anon with check (true);
-- no select/update/delete policies: the public key can only write

-- The deletion job. 03:00 UTC: after fx-refresh (02:00), before the alert
-- jobs (07:00, 07:30), and it touches nothing they read.
select cron.schedule('journey-signups-purge-daily', '0 3 * * *', $cron$
  delete from public.journey_signups where created_at < now() - interval '12 months';
$cron$);

-- ============================================================================
-- Done. Run 44-TESTPLAN.sql.
-- ============================================================================
