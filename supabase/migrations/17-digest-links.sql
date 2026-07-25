-- ============================================================================
-- 17-digest-links.sql — M3 polish: working links in digest emails, and an
-- unsubscribe that mail clients recognise.
--
-- Two columns on digest_subscriptions:
--
--   view_token — a per-subscriber 256-bit token that resolves to exactly the
--     SAME sanitized read a share token gives. Until now the server held only
--     a SHA-256 hash of the share token (migration 11), so it literally could
--     not reconstruct a follow URL: the confirmation email shipped a literal
--     "…" placeholder and the digest said "the link you were given" with no
--     link in it. This does NOT weaken hash-at-rest — dumping this table still
--     yields no share link, every view token is independently revocable, and
--     all of them die the moment their share is revoked or expires.
--
--     Deliberately valid BEFORE confirmation: the confirmation email carries
--     the live-page link, and whoever submitted the form already held a live
--     share token, so this grants nothing they could not simply forward.
--
--   unsubscribed_at — unsubscribe becomes a SOFT delete. Three reasons: the
--     Unsubscribed page offers an undo (mock 11); RFC 8058 one-click POSTs
--     must be idempotent; and the kept row acts as a suppression record, so a
--     resend from a stale form cannot quietly resurrect someone who opted out.
--     Unsubscribing stops EMAILS ONLY — the view token keeps working, because
--     losing your access is not what "unsubscribe" means (mock 11 state 4).
--
-- Idempotent, additive-only. Depends on 11 (_share_for_token, trip_shares),
-- 16 (digest_subscriptions, share_follower_stats).
-- ============================================================================

-- 256 bits from two v4 uuids — same generator as create_share_link().
-- Set as a DEFAULT (not just backfilled) so a not-yet-redeployed digest
-- function can still insert during the deploy window.
alter table public.digest_subscriptions
  add column if not exists view_token text;
alter table public.digest_subscriptions
  alter column view_token set default
    (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

alter table public.digest_subscriptions
  add column if not exists unsubscribed_at timestamptz;

update public.digest_subscriptions
   set view_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
 where view_token is null;

alter table public.digest_subscriptions
  alter column view_token set not null;

create unique index if not exists digest_subscriptions_view_token_idx
  on public.digest_subscriptions (view_token);

-- ---------------------------------------------------------------------------
-- _share_for_token: now resolves EITHER a raw share token (hashed lookup, as
-- since migration 11) OR a subscriber's view token. One extra indexed probe.
--
-- Both arms apply the identical liveness test, so revoke and expiry cut view
-- tokens off exactly as they cut off share links. Pause is NOT tested here —
-- it stays where migration 16 put it, inside shared_trip_summary/shared_feed,
-- so a paused link still resolves and can answer {paused:true,tripName}.
--
-- unsubscribed_at is deliberately NOT tested: emails stop, access does not.
-- ---------------------------------------------------------------------------
create or replace function public._share_for_token(p_token text)
returns public.trip_shares
language sql stable security definer set search_path = public as $$
  select s.* from public.trip_shares s
  where s.token_hash = encode(sha256(p_token::bytea), 'hex')
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
  union all
  select s.* from public.trip_shares s
  join public.digest_subscriptions d on d.share_id = s.id
  where d.view_token = p_token
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;
revoke all on function public._share_for_token(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- share_follower_stats: an unsubscribed row must stop counting as a follower
-- in the owner's Settings hero card.
-- ---------------------------------------------------------------------------
create or replace function public.share_follower_stats(p_trip uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_edit_trip(p_trip) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'share_id', s.id,
             'push',  (select count(*) from public.push_subscriptions p
                        where p.share_id = s.id),
             'email', (select count(*) from public.digest_subscriptions d
                        where d.share_id = s.id
                          and d.confirmed_at is not null
                          and d.unsubscribed_at is null)
           ))
    from public.trip_shares s
    where s.trip_id = p_trip and s.revoked_at is null
  ), '[]'::jsonb);
end $$;
revoke all on function public.share_follower_stats(uuid) from public, anon;
grant execute on function public.share_follower_stats(uuid) to authenticated;
