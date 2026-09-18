-- ============================================================================
-- 39-rotate-expired.sql — rotate_share_link() refuses an expired link.
--
-- 36 refused revoked links only. Rotating an expired one minted a fresh
-- token on a row that _share_for_token() still would not resolve, and the
-- UI announced "Link rotated" with a URL that never opened (audit
-- 2026-09-18). Same errcode as the revoked case — the client already maps
-- 22023 to "no such link". Extend the expiry, or revoke and mint, instead.
--
-- Idempotent. Depends on 36.
-- ============================================================================

create or replace function public.rotate_share_link(p_share uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_share public.trip_shares;
  v_token text;
begin
  select * into v_share from public.trip_shares where id = p_share;
  if v_share.id is null or v_share.revoked_at is not null
     or (v_share.expires_at is not null and v_share.expires_at <= now()) then
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
-- Done. Run 39-TESTPLAN.sql (36's plan still holds too).
-- ============================================================================
