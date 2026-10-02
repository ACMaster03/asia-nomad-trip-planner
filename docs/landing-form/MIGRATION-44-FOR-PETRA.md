# Migration 44, step by step (for Petra)

Patrik asked for this to be done by you: staging first, then production, the
same way you applied migration 41 on 23 September. Nothing here needs the
command line. Read it once through before you start, then follow it top to
bottom. About fifteen minutes.

## The words

- **Migration**: a file of database instructions that adds something. This one
  adds one table and one nightly cleanup job. It changes nothing that exists.
- **Staging**: the practice copy of the database. A mistake there hurts nobody.
- **Production**: the real database behind livhold.com.
- **SQL editor**: a page in the Supabase dashboard where you paste instructions
  and press Run.
- **Test plan**: a second file that checks the migration did what it should. It
  undoes everything it tries, so it leaves no trace behind.

## What this migration does

It creates `journey_signups`, the table the new form on journey.livhold.com
will write to, and a job that runs every night and deletes answers older than
12 months, which the privacy policy promises. The form itself is not live until
Patrik pastes it into the landing page, after the merge. So nothing changes for
anyone the moment you run this.

## What could go wrong

Very little, because the migration only adds things. The two real risks are
pasting into the wrong project, which the address bar tells you, and pasting
half the file. Running it twice is harmless.

## Step 1: get the two files

Both are on GitHub. Open the link, press the **Raw** button, select all, copy.

- The migration:
  https://github.com/ACMaster03/asia-nomad-trip-planner/blob/kyh/kind-pascal-9w0d3x/supabase/migrations/44-journey-signups.sql
- The test plan:
  https://github.com/ACMaster03/asia-nomad-trip-planner/blob/kyh/kind-pascal-9w0d3x/supabase/migrations/44-TESTPLAN.sql

## Step 2: staging

1. Open https://supabase.com/dashboard and sign in.
2. Open the **staging** project. Check the address bar: it must contain
   `fdcncqnklscbztcydtye`. If it contains `wvmnudcwcqktcugouqoe`, that is
   production. Stop and switch.
3. Left sidebar → **SQL Editor** → **New query**.
4. Paste the whole migration file. Press **Run** (or Cmd+Enter on a Mac).
5. Expect: **Success**, and a result with a single number in it. That number is
   the id of the nightly job. A red error instead: copy the whole message and
   send it to Claude. Do not retry blindly.
6. Check: left sidebar → **Table Editor** → `journey_signups` is in the list,
   with no rows.

## Step 3: the test plan, on staging only

1. SQL Editor → New query → paste the whole test plan → Run.
2. Expect: **Success**. The test plan stops with an error that begins
   `TP44 FAIL` if anything is wrong, so success means every check passed. It
   cleaned up after itself: `journey_signups` still has no rows.
3. Not on production. Its fixtures are pretend sign-ups.

## Step 4: production

1. Switch to the **production** project (the project switcher, top left). The
   address bar must contain `wvmnudcwcqktcugouqoe`.
2. SQL Editor → New query → paste the migration → Run.
3. Expect: **Success**, and the single number.
4. Two read-only checks, one at a time, paste and Run:

   ```sql
   select column_name, data_type, is_nullable
   from information_schema.columns
   where table_name = 'journey_signups'
   order by ordinal_position;
   ```

   Expect 11 rows, in this order: id, when, length, plan_today, first_name,
   email, call_ok, source, consent_text_version, submitted_at, created_at.

   ```sql
   select jobname, schedule, active
   from cron.job
   where jobname = 'journey-signups-purge-daily';
   ```

   Expect one row: `journey-signups-purge-daily`, `0 3 * * *`, `true`.

## Step 5: say so

Tell Patrik and Claude it is done on both. The pull request is then merged
together, the usual way, and Patrik pastes the form into the landing page.

## If something goes wrong

- **"schema cron does not exist"** or **"relation cron.job does not exist"**:
  the scheduler is switched off on that project. Left sidebar → Database →
  Extensions → search `pg_cron` → enable → run the migration again. It has
  been on since migration 8, so this is unlikely.
- **"permission denied"**: you are not signed in as the project's owner. Ask
  Patrik.
- **"TP44 FAIL: …"**: copy the message to Claude. The test plan changed
  nothing.
- **Ran the migration on the wrong project**: say so. The undo below removes
  it cleanly, and nothing else was touched.

## Undo

Only if asked. Paste and Run on the project in question:

```sql
select cron.unschedule('journey-signups-purge-daily');
drop table if exists public.journey_signups;
```
