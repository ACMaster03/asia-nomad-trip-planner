-- ============================================================================
-- 49-usage-counts.sql — make the 30 November goal countable (#120; Patrik and
-- Petra, 28 Sep 2026, docs/PLAN-OCT-NOV-2026.md).
--
-- The goal is three numbers: journeys set up by strangers, followers opening
-- the feed weekly, travellers checking in weekly. The first and the last are in
-- the data already (trips, trip_events). The second was not: nothing recorded
-- that a follower opened anything. And nothing said which door a new account
-- came through. This adds both, and only what /privacy already describes
-- ("Usage counts", published ahead of this code on 3 Oct, #123):
--
--   feed_open_days   one mark per follower, or per follow link, per day: "the
--                    feed was opened on this day", never each tap or what was
--                    looked at. Written only by mark_feed_open(), called by the
--                    follower's pages in the browser (not by the server render,
--                    which link previews in WhatsApp or Telegram also hit).
--                    Deleted after 12 months (feed-open-days-purge-daily), and
--                    with the account or the follow link.
--
--   account_sources  how an account found Livhold: 'follow_link' (with the
--                    journey it led to) or 'partner_invite' (with the journey).
--                    Noted by triggers on the two doors, user_follows and
--                    trip_invites, and only in the account's first 24 hours,
--                    so a follow a month later is not a "source". No row means
--                    neither: tools/goal-numbers.sql splits those into the list
--                    on journey.livhold.com (the email is in journey_signups)
--                    and "none of these". Deleted with the account.
--
-- Neither table is readable or writable through the public key: RLS on, no
-- policies, no grants. Only the definer functions below and the owner
-- (postgres, which runs tools/goal-numbers.sql) touch them.
--
-- Adds two tables, three functions, two triggers and one cron job; changes no
-- existing row and no existing function. Idempotent. Production only since
-- 25 Oct (CLAUDE.md, "The database: production only"): a rolled-back dry run
-- with 49-TESTPLAN.sql first, then apply.
--
-- Undo (nothing else depends on these):
--   select cron.unschedule('feed-open-days-purge-daily');
--   drop trigger if exists user_follows_note_source on public.user_follows;
--   drop trigger if exists trip_invites_note_source on public.trip_invites;
--   drop function if exists public.mark_feed_open(text);
--   drop function if exists public._note_source_from_follow();
--   drop function if exists public._note_source_from_invite();
--   drop function if exists public._note_signup_source(uuid, text, uuid);
--   drop table if exists public.feed_open_days;
--   drop table if exists public.account_sources;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) The tables.
-- ---------------------------------------------------------------------------

create table if not exists public.feed_open_days (
  day         date not null default current_date,
  follower_id uuid references auth.users (id) on delete cascade,
  share_id    uuid references public.trip_shares (id) on delete cascade,
  check ((follower_id is null) <> (share_id is null))
);
-- One mark per follower (or per link) per day; the conflict target of
-- mark_feed_open's insert.
create unique index if not exists feed_open_days_one_a_day
  on public.feed_open_days (day, (coalesce(follower_id, share_id)));

comment on table public.feed_open_days is
  'One mark per follower account, or per follow link, per day the feed was opened (#120). Written by mark_feed_open() only. Purged 12 months after the day (feed-open-days-purge-daily), as /privacy promises.';

create table if not exists public.account_sources (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  source   text not null check (source in ('follow_link', 'partner_invite')),
  trip_id  uuid references public.trips (id) on delete set null,
  noted_at timestamptz not null default now()
);

comment on table public.account_sources is
  'How an account found Livhold, noted in its first 24 hours by the follow and invite triggers (#120). No row: the landing-page list or none of these (tools/goal-numbers.sql).';

alter table public.feed_open_days  enable row level security;
alter table public.account_sources enable row level security;
revoke all on public.feed_open_days  from public, anon, authenticated;
revoke all on public.account_sources from public, anon, authenticated;
-- no policies: the public key can neither read nor write these

-- ---------------------------------------------------------------------------
-- 2) The source: noted once, in the account's first 24 hours.
-- ---------------------------------------------------------------------------

create or replace function public._note_signup_source(p_uid uuid, p_source text, p_trip uuid)
returns void
language sql security definer set search_path = public as $$
  insert into public.account_sources (user_id, source, trip_id)
  select p_uid, p_source, p_trip
  from auth.users u
  where u.id = p_uid
    and u.created_at > now() - interval '24 hours'
  on conflict (user_id) do nothing;
$$;
revoke all on function public._note_signup_source(uuid, text, uuid) from public, anon, authenticated;

-- A follow through a link (follow_by_token sets via_share_id).
create or replace function public._note_source_from_follow()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.via_share_id is not null then
    perform public._note_signup_source(
      new.follower_id, 'follow_link',
      (select s.trip_id from public.trip_shares s where s.id = new.via_share_id));
  end if;
  return null;
end $$;
revoke all on function public._note_source_from_follow() from public, anon, authenticated;

drop trigger if exists user_follows_note_source on public.user_follows;
create trigger user_follows_note_source
  after insert on public.user_follows
  for each row execute function public._note_source_from_follow();

-- A travel partner's invitation accepted (accept_invite, by id or by token).
create or replace function public._note_source_from_invite()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted'
     and new.accepted_by is not null then
    perform public._note_signup_source(new.accepted_by, 'partner_invite', new.trip_id);
  end if;
  return null;
end $$;
revoke all on function public._note_source_from_invite() from public, anon, authenticated;

drop trigger if exists trip_invites_note_source on public.trip_invites;
create trigger trip_invites_note_source
  after update of status on public.trip_invites
  for each row execute function public._note_source_from_invite();

-- ---------------------------------------------------------------------------
-- 3) The mark: mark_feed_open(p_token).
--
--   With a token (the follow link page): a signed-in caller who follows anyone
--   is marked as themselves; a traveller or viewer of that journey looking at
--   their own link is not marked at all; anyone else is marked as the link.
--   Without a token (the follower's Home and a followed journey's page): the
--   caller is marked if they follow anyone, otherwise nothing.
--   A link that is unknown, revoked, expired or paused marks nothing. Never an
--   error for the caller: the page does not wait on it.
-- ---------------------------------------------------------------------------

create or replace function public.mark_feed_open(p_token text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_share   public.trip_shares;
  v_follows boolean;
begin
  v_follows := v_uid is not null
    and exists (select 1 from public.user_follows f where f.follower_id = v_uid);

  if p_token is not null then
    v_share := public._share_for_token(p_token);
    if v_share.id is null or v_share.paused_at is not null then
      return;
    end if;
    if v_uid is not null and public.can_view_trip(v_share.trip_id) then
      return;
    end if;
    if not v_follows then
      insert into public.feed_open_days (share_id) values (v_share.id)
      on conflict (day, (coalesce(follower_id, share_id))) do nothing;
      return;
    end if;
  elsif not v_follows then
    return;
  end if;

  insert into public.feed_open_days (follower_id) values (v_uid)
  on conflict (day, (coalesce(follower_id, share_id))) do nothing;
end $$;
revoke all on function public.mark_feed_open(text) from public;
grant execute on function public.mark_feed_open(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) The deletion job. 03:05 UTC, beside journey-signups-purge-daily (03:00).
-- ---------------------------------------------------------------------------

select cron.schedule('feed-open-days-purge-daily', '5 3 * * *', $cron$
  delete from public.feed_open_days where day < current_date - interval '12 months';
$cron$);

-- ============================================================================
-- Done. Run 49-TESTPLAN.sql (inside the same rolled-back dry run first).
-- ============================================================================
