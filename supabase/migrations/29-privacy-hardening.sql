-- ============================================================================
-- 29-privacy-hardening.sql — security review follow-ups (2026-08-08).
--
-- The trip boundary itself held up: RLS splits view/edit correctly, the owner
-- column is frozen, invites cannot self-escalate, and anon followers reach
-- nothing but the sanitized RPCs. What the review found were leaks and holes
-- AROUND that boundary. This closes them:
--
--   1. pg_net was left at Supabase's default grants — any signed-in user could
--      make outbound HTTP requests from the database AND read the cron secret
--      out of net.http_request_queue's stored headers.
--   2. public.places was world-readable INCLUDING created_by, so any account
--      could attribute user-added places to a person and reconstruct their
--      itinerary — the one real way around the trip RLS.
--   3. places_update let a user relabel their own row source='catalogue' and
--      pass it off as curated content.
--   4. unsubscribe_push(endpoint) was anon-callable with no proof of ownership.
--   5. delete_my_account() left the caller's email behind in alert_log and
--      digest_subscriptions, and deleted invites addressed to an UNVERIFIED
--      JWT email — a denial-of-onboarding against any address.
--
-- Idempotent, additive-only (one constraint is deliberately replaced — see 2).
-- Depends on 06 (can_view_trip), 09 (places), 10 (check_ins), 11 (trip_shares,
-- _share_for_token), 13 (push_subscriptions), 16 (digest_subscriptions),
-- 26 (delete_my_account).
--
-- AUTHORITY NOTE: this file supersedes 09's places policies and 26's
-- delete_my_account(). Re-running either of those afterwards reopens what is
-- closed here — always (re)apply 29 last.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) LOCK DOWN pg_net.
--
-- Enabling the extension (08-deadline-alerts.sql) grants usage on schema net
-- and execute on net.http_post/http_get to anon and authenticated by default.
-- Two separate problems, both fixed by taking the grants away:
--
--   * SSRF: any signed-in user could POST anywhere from the database host,
--     including at Supabase's own internal endpoints.
--   * SECRET DISCLOSURE: net.http_request_queue stores request headers
--     VERBATIM, and every producer here (13, 19, 27) puts x-cron-secret in
--     them. Reading that table hands over the key to push-fanout, digest-send,
--     fx-refresh and stay-deadline-alerts.
--
-- Nothing legitimate breaks: the only callers are SECURITY DEFINER functions
-- owned by postgres (notify_push_fanout) and pg_cron jobs, neither of which
-- goes through these role grants.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'net') then
    execute 'revoke all on schema net from anon, authenticated';
    execute 'revoke all on all tables    in schema net from anon, authenticated';
    execute 'revoke all on all functions in schema net from anon, authenticated';
    execute 'revoke all on all sequences in schema net from anon, authenticated';
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2) PLACES — stop user-added places leaking across accounts.
--
-- 09 made the whole table readable by every signed-in user ("world data, like
-- the catalogue"). That is right for the seeded catalogue and wrong for the
-- rows the /live check-in flow creates: those carry created_by, created_at and
-- a name the traveller chose ("our apartment", a friend's address), so
-- `select … where created_by = '<someone>'` order by created_at reconstructed
-- a private itinerary from outside the trip entirely.
--
-- The fix splits the table by `source`, which is what it always meant:
--   catalogue rows  → world data, unchanged.
--   user rows       → the creator, plus anyone who can view a trip that has
--                     CHECKED IN there. That second arm is what keeps the
--                     picker working for co-travellers: creating a custom place
--                     during a check-in writes check_ins.place_id, so a partner
--                     on the same trip keeps seeing it (CheckInModal's
--                     addCustom → insertUserPlace → placeId path).
--
-- FREE FIX, worth naming: search_places (24) is SECURITY INVOKER, so its
-- "suppress the OSM copy of a place they already have" subquery now runs under
-- this policy too. Before, ANY user's row suppressed an OSM result for
-- EVERYONE — inserting "Old Town" globally hid it from every search. Scoping
-- the read scopes the suppression; no change to that function is needed.
-- ---------------------------------------------------------------------------

-- Can the caller see this user place because a trip they can view checked in
-- there? SECURITY DEFINER so the policy does not recurse into check_ins' RLS.
create or replace function public.place_on_my_trip(p_place uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.check_ins ci
    where ci.place_id = p_place and public.can_view_trip(ci.trip_id)
  );
$$;
revoke all on function public.place_on_my_trip(uuid) from public, anon;
grant execute on function public.place_on_my_trip(uuid) to authenticated;

drop policy if exists places_select on public.places;
create policy places_select on public.places for select
  to authenticated using (
    source = 'catalogue'
    or created_by = auth.uid()
    or public.place_on_my_trip(id)
  );

-- Restricting visibility forces the uniqueness question. `unique (city_id,
-- name)` was created to make 09's catalogue seed idempotent; applying it
-- GLOBALLY to user rows was a side effect, and a harmful one once rows can be
-- invisible: two strangers adding "Jay Fai" in Bangkok is ordinary, and the
-- second one would hit a duplicate-key error on a row they are not allowed to
-- see or reuse. So: catalogue rows stay globally unique, user rows become
-- unique PER CREATOR.
alter table public.places drop constraint if exists places_city_id_name_key;
create unique index if not exists places_catalogue_city_name_idx
  on public.places (city_id, name) where source = 'catalogue';
create unique index if not exists places_user_city_name_idx
  on public.places (city_id, name, created_by) where source = 'user';

-- 3) A user may still fix their own place, but may no longer promote it into
--    the curated catalogue (09's WITH CHECK re-asserted created_by and never
--    re-asserted source, so `update … set source='catalogue'` was accepted and
--    the row then ranked as in_catalogue in search_places).
drop policy if exists places_update on public.places;
create policy places_update on public.places for update
  to authenticated
  using      (created_by = auth.uid() or public.is_admin())
  with check ((created_by = auth.uid() and source = 'user') or public.is_admin());


-- ---------------------------------------------------------------------------
-- 4) unsubscribe_push — prove you hold the link, not just the endpoint.
--
-- 13 deleted by endpoint alone, granted to anon, with the endpoint's own
-- entropy as the only control. A leaked push-service URL therefore let a
-- stranger silently mute a follower's notifications. Binding the delete to the
-- share the subscription belongs to costs the caller nothing (the follow page
-- already holds its token) and makes the endpoint insufficient on its own.
--
-- The single-argument version is DROPPED, not left alongside: an overload that
-- still accepts an endpoint by itself would leave the hole exactly where it was.
-- ---------------------------------------------------------------------------
drop function if exists public.unsubscribe_push(text);

create or replace function public.unsubscribe_push(p_token text, p_endpoint text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_share public.trip_shares;
begin
  v_share := public._share_for_token(p_token);
  if v_share.id is null then
    raise exception 'invalid link' using errcode = '42501';
  end if;
  delete from public.push_subscriptions
   where endpoint = p_endpoint and share_id = v_share.id;
end $$;
revoke all on function public.unsubscribe_push(text, text) from public;
grant execute on function public.unsubscribe_push(text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5) delete_my_account — finish the job, and stop trusting the JWT's email.
--
-- Two defects in 26:
--
--   a) INCOMPLETE. The FK analysis was right about the tables it listed, but
--      two personal-data stores hang off neither auth.users nor a trip the
--      caller owns, so the caller's EMAIL ADDRESS survived deletion:
--        alert_log.sent_to            — cascades only from trips.id, so every
--                                       alert on someone ELSE'S trip kept it
--                                       (plus 'push:<uid>' rows).
--        digest_subscriptions.email   — cascades only from trip_shares, so an
--                                       email subscription to another person's
--                                       shared trip kept it.
--
--   b) UNVERIFIED IDENTITY. Invites were deleted on `lower(email) = the JWT's
--      email`, which is an unverified claim: if email confirmation is ever off,
--      signing up as victim@example.com and calling this destroys every pending
--      invite addressed to that address on trips the caller has nothing to do
--      with. The address now comes from auth.users (this is SECURITY DEFINER,
--      so it can read it) and is only used for the by-address deletions when
--      email_confirmed_at is actually set.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_email    text;
  v_verified boolean := false;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- The authoritative address, not the caller's claim about it.
  select lower(u.email), u.email_confirmed_at is not null
    into v_email, v_verified
    from auth.users u where u.id = v_uid;

  -- 1) Trips they OWN. Cascades to segments/stays/transport/extras/notes/
  --    ledger/trip_members/trip_invites/trip_events/check_ins/trip_shares/
  --    push_subscriptions/digest subscribers, and nulls other users'
  --    profiles.active_trip_id (migration 07's on delete set null).
  delete from public.trips where owner = v_uid;

  -- 2) Their seat on OTHER people's trips.
  delete from public.trip_members where user_id = v_uid;

  -- 3) Invite rows naming them, on trips that still exist. The by-address arm
  --    runs only for a CONFIRMED address (see (b) above).
  delete from public.trip_invites
   where invited_by = v_uid
      or accepted_by = v_uid
      or (v_verified and v_email is not null and lower(email) = v_email);

  -- 4) Personal data that no cascade reaches (see (a) above).
  if v_verified and v_email is not null then
    delete from public.digest_subscriptions where lower(email) = v_email;
  end if;
  if to_regclass('public.alert_log') is not null then
    execute 'delete from public.alert_log where lower(sent_to) = $1 or sent_to = $2'
      using coalesce(v_email, ''), 'push:' || v_uid::text;
  end if;

  -- 5) The two nullable no-action references, if those tables/columns exist.
  if to_regclass('public.ledger') is not null then
    execute 'update public.ledger set created_by = null where created_by = $1' using v_uid;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'cities' and column_name = 'owner'
  ) then
    execute 'update public.cities set owner = null where owner = $1' using v_uid;
  end if;

  -- 6) The account itself. profiles.id cascades from here.
  delete from auth.users where id = v_uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ============================================================================
-- Done. Run 29-TESTPLAN.sql against STAGING before prod, and deploy the
-- updated Edge Functions + app in the same window: unsubscribe_push changed
-- signature, so an old client calling the 1-arg version gets "function does
-- not exist" until the new bundle ships.
-- ============================================================================
