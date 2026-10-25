-- ============================================================================
-- 50-reminder-email-switch.sql — a switch for the reminder emails (#150;
-- Patrik, 2 Oct and 25 Oct 2026).
--
-- /privacy says reminders about your own bookings (a stay's cancel-by date, a
-- subscription charge) "go to your email; you can switch them off in your
-- notification settings". Until now nothing could: stay-deadline-alerts and
-- subscription-alerts emailed every traveller on a journey. This adds the
-- switch, one column on the person's notify_prefs row (migration 37):
--
--   deadline_email   reminder emails for stay deadlines and subscription
--                    charges. On by default; a missing row is the default.
--
-- Both Edge Functions skip a traveller whose row says false. The row's
-- policies (37: own row only, all verbs) cover the new column; nothing else
-- changes. A whole-row upsert that does not name the column (the iPhone app
-- today) leaves it as it is.
--
-- Additive: one column with a constant default, so every existing row reads
-- true, which is what the functions did before. No row changes value. Production
-- only since 25 Oct: a rolled-back dry run with 50-TESTPLAN.sql first.
--
-- Undo (after redeploying the two functions without the switch):
--   alter table public.notify_prefs drop column if exists deadline_email;
-- ============================================================================

alter table public.notify_prefs
  add column if not exists deadline_email boolean not null default true;

comment on column public.notify_prefs.deadline_email is
  'Reminder emails for stay deadlines and subscription charges (#150). Read by stay-deadline-alerts and subscription-alerts; default true.';

-- ============================================================================
-- Done. Run 50-TESTPLAN.sql (inside the same rolled-back dry run first).
-- ============================================================================
