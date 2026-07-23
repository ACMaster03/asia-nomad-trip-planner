-- ============================================================================
-- 11-share-links.sql — M3 item 1: no-account family follow links
--
-- trip_shares stores only a SHA-256 HASH of the link token (a leaked table
-- dump reveals no usable links), and anon NEVER touches tables directly:
-- access goes through sanitized SECURITY DEFINER RPCs that return whitelisted
-- projections — never raw state/ledger (confirmation numbers, prices, notes).
-- Tokens are 256-bit random → enumeration is infeasible (the "rate limit"
-- of the approved plan is entropy, not counters).
--
-- Idempotent, additive-only. Depends on 06 (can_edit_trip), 10 (trip_events).
-- ============================================================================

create table if not exists public.trip_shares (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  token_hash   text not null unique,
  -- First 6 chars of the raw token, for the Settings list display ("f7Kq3d…").
  -- Useless for guessing: 250 remaining bits of entropy.
  token_prefix text,
  label        text,
  created_by   uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz, -- null = never expires
  revoked_at   timestamptz
);
alter table public.trip_shares add column if not exists token_prefix text;
create index if not exists trip_shares_trip_idx on public.trip_shares (trip_id);

alter table public.trip_shares enable row level security;

-- Editors manage a trip's links; followers (anon) have NO table access at all.
drop policy if exists trip_shares_select on public.trip_shares;
create policy trip_shares_select on public.trip_shares
  for select to authenticated using (public.can_edit_trip(trip_id));
drop policy if exists trip_shares_update on public.trip_shares;
create policy trip_shares_update on public.trip_shares
  for update to authenticated
  using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id));
drop policy if exists trip_shares_delete on public.trip_shares;
create policy trip_shares_delete on public.trip_shares
  for delete to authenticated using (public.can_edit_trip(trip_id));
-- No INSERT policy on purpose: links are minted ONLY via create_share_link()
-- so the raw token never exists anywhere but the creator's response.

-- ---------------------------------------------------------------------------
-- create_share_link(trip, label, expires) → the raw token, exactly once.
-- The token is hashed at rest, so it can never be re-shown: the Settings UI
-- offers Copy only at creation (mock 09's per-row Copy is overridden by the
-- approved plan's hash-at-rest requirement).
-- ---------------------------------------------------------------------------
drop function if exists public.create_share_link(uuid, text); -- pre-final signature
create or replace function public.create_share_link(
  p_trip uuid, p_label text default null, p_expires timestamptz default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  if auth.uid() is null or not public.can_edit_trip(p_trip) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- 256 bits from two v4 uuids (pgcrypto not required).
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.trip_shares (trip_id, token_hash, token_prefix, label, created_by, expires_at)
  values (p_trip, encode(sha256(v_token::bytea), 'hex'), left(v_token, 6), p_label, auth.uid(), p_expires);
  return v_token;
end $$;
revoke all on function public.create_share_link(uuid, text, timestamptz) from public, anon;
grant execute on function public.create_share_link(uuid, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Internal: token → live share row (null if unknown/revoked/expired).
-- ---------------------------------------------------------------------------
create or replace function public._share_for_token(p_token text)
returns public.trip_shares
language sql stable security definer set search_path = public as $$
  select s.* from public.trip_shares s
  where s.token_hash = encode(sha256(p_token::bytea), 'hex')
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now());
$$;
revoke all on function public._share_for_token(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- shared_trip_summary(token) → sanitized header + route. NO prices, NO stays,
-- NO bookings, NO notes, NO ledger — route coords come from the auth-only
-- cities catalogue via this definer join.
-- ---------------------------------------------------------------------------
create or replace function public.shared_trip_summary(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_share public.trip_shares;
  v_trip  public.trips;
begin
  v_share := public._share_for_token(p_token);
  if v_share.id is null then return null; end if;
  select * into v_trip from public.trips where id = v_share.trip_id;
  if v_trip.id is null then return null; end if;
  return jsonb_build_object(
    'tripName',  v_trip.state->'meta'->>'tripName',
    'startDate', v_trip.state->'meta'->>'startDate',
    'endDate',   v_trip.state->'meta'->>'endDate',
    'route', coalesce((
      select jsonb_agg(jsonb_build_object(
               'city',    seg->>'city',
               'country', seg->>'country',
               'arrive',  seg->>'arrive',
               'depart',  seg->>'depart',
               'lat',     c.lat,
               'lng',     c.lng
             ) order by seg->>'arrive')
      from jsonb_array_elements(coalesce(v_trip.state->'segments', '[]'::jsonb)) seg
      left join public.cities c on c.city = seg->>'city'
      where coalesce((seg->>'include')::boolean, true)
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.shared_trip_summary(text) from public;
grant execute on function public.shared_trip_summary(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- shared_feed(token, before, limit) → whitelisted follower/public events,
-- newest first. Payload is re-built per kind — never passed through raw.
-- ---------------------------------------------------------------------------
create or replace function public.shared_feed(
  p_token text, p_before timestamptz default null, p_limit int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_share public.trip_shares;
begin
  v_share := public._share_for_token(p_token);
  if v_share.id is null then return null; end if;
  return coalesce((
    select jsonb_agg(row_ev order by occurred_at desc) from (
      select e.occurred_at,
             jsonb_build_object(
               'id', e.id,
               'kind', e.kind,
               'occurred_at', e.occurred_at,
               'payload', case e.kind
                 when 'checkin' then jsonb_build_object('placeName', e.payload->>'placeName')
                 when 'note'    then jsonb_build_object('text', e.payload->>'text')
                 when 'arrived' then jsonb_build_object('city', e.payload->>'city')
                 else '{}'::jsonb
               end,
               'rating',  ci.rating,
               'comment', ci.comment
             ) as row_ev
      from public.trip_events e
      left join public.check_ins ci on ci.event_id = e.id
      where e.trip_id = v_share.trip_id
        and e.visibility in ('followers', 'public')
        and (p_before is null or e.occurred_at < p_before)
      order by e.occurred_at desc
      limit least(greatest(p_limit, 1), 50)
    ) sub
  ), '[]'::jsonb);
end $$;
revoke all on function public.shared_feed(text, timestamptz, int) from public;
grant execute on function public.shared_feed(text, timestamptz, int) to anon, authenticated;
