-- ============================================================================
-- 41-track-spending.sql — the once-per-account answer behind Money's quiet
-- start (mock 16 §1–2, issue #62).
--
-- "Track what you spend on this journey?" is asked once per ACCOUNT, on the
-- first visit to Money once a journey exists, because the answer is about the
-- person, not the journey: a second journey does not ask again, and a travel
-- partner who joins a journey is asked on their own first visit ("the answer
-- is theirs, not the journey's"). So it lives on the profile, beside
-- active_trip_id (07), not in the trip document.
--
--   null   not asked yet: the question shows, as a sheet over the page
--   true   "Yes, track it": the full Money page, its cards unlocking as
--          entries arrive (mock 16 §6)
--   false  "Not now": the quiet page, the bookings and an add button; the
--          "Track spending" switch under the avatar turns it back on
--
-- Nothing is deleted either way. The answer only changes what the page shows.
--
-- NO BACKFILL. Every account that exists when this runs is asked once, on its
-- first visit to Money after the stage 2 build ships. The ledger records no
-- author, so "who already tracks" could only be guessed from trip membership,
-- which is exactly what the mock rules out for a travel partner. The
-- alternative, one UPDATE that marks every existing account as "yes", is in
-- docs/NOTES.md (2026-09-23, migration 41) with the reasons it was not taken.
--
-- PERMISSIONS NEED NOTHING NEW. profiles_update (03) already lets a signed-in
-- user update their own row and no one else's; the two guard triggers look
-- only at is_admin (03) and active_trip_id (07). Co-members of a shared trip
-- can read the row (06, for display_name), so they can see this boolean too:
-- harmless, it says only whether someone tracks spending.
--
-- ORDER OF OPERATIONS: apply this before the stage 2 app code reaches
-- production. The app will read the column by name.
--
-- Idempotent and additive-only. Staging first:
--
--     tools/db.sh apply 41 && tools/db.sh test 41 && tools/db.sh --prod apply 41
-- ============================================================================

alter table public.profiles
  add column if not exists track_spending boolean;

comment on column public.profiles.track_spending is
  'Money''s once-per-account question (mock 16, #62): null = not asked yet, true = track spending (the full page), false = not now (the quiet page).';
