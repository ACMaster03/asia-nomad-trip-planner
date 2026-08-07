-- ============================================================================
-- 28-invite-token.sql — the invite gets a LINK (handoff frame 06b, /invite/[token]).
--
-- Migration 25 built acceptance for a signed-in invitee, but the front door was
-- missing: Anna receives an email, has no account, and a pending invitee has NO
-- trip access (can_view_trip is false until the membership row exists) — so an
-- unauthenticated visitor could learn nothing at all, not even whose trip she
-- was asked to join. The 06b frame needs exactly that pre-auth moment:
-- "Patrik invited you to plan together", the trip card, her prefilled email.
--
-- Two additions close it:
--   token                    — an unguessable id ON the invite row, put in the
--                              emailed link.
--   invite_preview(token)    — anon-callable definer RPC returning the
--                              sanitized fields the 06b frame renders and
--                              nothing else.
--   accept_invite_by_token   — resolve token → invite and accept via 25's
--                              accept_invite (same checks, same single path).
--
-- WHY PLAINTEXT AT REST, unlike trip_shares' hash (migration 11): a share
-- token IS the credential — it grants the live feed to whoever holds it, so a
-- table dump must not leak usable links. The invite token is NOT the join
-- credential: joining still requires signing in with the invited email
-- (accept_invite re-checks it), so the token alone unlocks only the four
-- preview fields below. That lower stake buys back re-showability — the
-- Settings panel can offer "Copy link" for a pending invite at any time
-- instead of exactly once at creation.
--
-- Idempotent, additive-only. Depends on 02 (trip_invites), 25 (accept_invite).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) The token. 122 random bits (a v4 uuid, dashes stripped so the URL stays
--    tidy) — enumeration is infeasible; entropy is the rate limit, as in 11.
--    ADD COLUMN with a volatile default rewrites the table, stamping every
--    EXISTING invite with its own token — pending invites sent before this
--    migration become linkable without any backfill step.
-- ---------------------------------------------------------------------------
alter table public.trip_invites
  add column if not exists token text not null
    default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists trip_invites_token_idx
  on public.trip_invites (token);

-- No RLS change: the table stays invisible to anon. The token column itself is
-- readable exactly where the row already was — by trip members (who may share
-- the link) and by the addressed invitee.

-- ---------------------------------------------------------------------------
-- 2) What does the link show BEFORE sign-in?
--
-- SECURITY DEFINER and granted to anon: the token in the URL is the only
-- credential. Returns null for unknown, revoked and accepted tokens alike — a
-- guessed token must be indistinguishable from a dead one.
--
-- The projection is the 06b frame and NOTHING else: trip name, inviter name,
-- invited email, plus role — role is invite-row data (pending_invites already
-- hands it to the invitee) and the card's "you join as a full co-editor" line
-- needs it. It must never grow a column that leaks the trip itself (state,
-- ledger, dates, route): holding the link is not membership.
-- ---------------------------------------------------------------------------
create or replace function public.invite_preview(p_token text)
returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
           'trip_name',       t.name,
           'invited_by_name', coalesce(nullif(p.display_name, ''), 'Someone'),
           'email',           i.email,
           'role',            i.role)
    from public.trip_invites i
    join public.trips        t on t.id = i.trip_id
    left join public.profiles p on p.id = i.invited_by
   where i.token = p_token
     and i.status = 'pending';
$$;
revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Accept, by token, after the magic link signed her in.
--
-- Resolution only — every rule stays in 25's accept_invite (signed in, still
-- pending, addressed to the caller's verified email, role from the row): one
-- enforcement path, not two to keep aligned.
--
-- The one addition is idempotence ACROSS the status flip: accept_invite's
-- no-op tolerance covers a double-tap racing itself, but a revisit of the link
-- after a successful accept finds status = 'accepted' and would read as "no
-- pending invite" — an error page for the person who did everything right. If
-- the caller IS the recorded accepter, hand back the trip id again instead.
--
-- Same generic error for unknown token / revoked / answered by someone else /
-- addressed to a different email: a token guess must learn nothing, and the
-- error must not distinguish the cases.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite_by_token(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.trip_invites;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_invite from public.trip_invites where token = p_token;

  if v_invite.id is not null
     and v_invite.status = 'accepted'
     and v_invite.accepted_by = auth.uid() then
    return v_invite.trip_id;  -- already in — a revisit is not an error
  end if;

  if v_invite.id is null
     or v_invite.status <> 'pending'
     or lower(v_invite.email) is distinct from lower(auth.jwt() ->> 'email') then
    raise exception 'no pending invite for you with that id' using errcode = '42501';
  end if;

  return public.accept_invite(v_invite.id);
end $$;
revoke all on function public.accept_invite_by_token(text) from public, anon;
grant execute on function public.accept_invite_by_token(text) to authenticated;
