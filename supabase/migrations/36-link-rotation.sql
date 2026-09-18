-- ============================================================================
-- 36-link-rotation.sql — rotate a leaked follow link (issue #12, part 2).
--
-- Revoke-and-mint is the wrong tool when the LINK leaked rather than a
-- PERSON misbehaving: push_subscriptions, digest_subscriptions and
-- user_follows.via_share_id all hang off the share row, so revoking throws
-- every opt-in away with the URL. Rotation writes a fresh token_hash onto the
-- SAME row — every copy of the old URL dies, everything keyed by share_id
-- survives.
--
-- The raw token is returned exactly once, the way create_share_link() does
-- it: hashed at rest, never re-shown.
--
-- Idempotent, additive-only. Depends on 11 (trip_shares, create_share_link).
-- ============================================================================

alter table public.trip_shares add column if not exists rotated_at timestamptz;

create or replace function public.rotate_share_link(p_share uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_share public.trip_shares;
  v_token text;
begin
  select * into v_share from public.trip_shares where id = p_share;
  if v_share.id is null or v_share.revoked_at is not null then
    raise exception 'no such link' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.can_edit_trip(v_share.trip_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Same generator as create_share_link(): 256 bits from two v4 uuids.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update public.trip_shares
     set token_hash   = encode(sha256(v_token::bytea), 'hex'),
         token_prefix = left(v_token, 6),
         rotated_at   = now()
   where id = p_share;
  return v_token;
end $$;
revoke all on function public.rotate_share_link(uuid) from public, anon;
grant execute on function public.rotate_share_link(uuid) to authenticated;

-- ============================================================================
-- Done. Run 36-TESTPLAN.sql against STAGING before prod.
-- ============================================================================
