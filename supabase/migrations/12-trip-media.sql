-- ============================================================================
-- 12-trip-media.sql — M3 photos, FREE-TIER version (no Pro, no signed URLs).
--
-- Bucket is PUBLIC with unguessable paths: trip-media/<trip_id>/<event_id>/n.jpg
-- — both path segments are 128-bit uuids, so a photo URL is exactly as
-- guessable as a follow-link token (the app's existing access model for
-- followers). Uploads are RLS-gated to trip editors; client compresses to
-- ~250 KB/photo, so the 1 GB free allowance ≈ years of family photos.
-- Upgrade path (Pro + private bucket + signed URLs) stays open — flip
-- public→false and add a signing route; paths don't change.
--
-- Idempotent, additive-only. Depends on 06 (can_edit_trip).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-media', 'trip-media', true, 5242880, -- 5 MB cap per object
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Editors upload under their trip's folder; nobody else writes anything.
drop policy if exists trip_media_insert on storage.objects;
create policy trip_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'trip-media'
    and public.can_edit_trip(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists trip_media_delete on storage.objects;
create policy trip_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'trip-media'
    and public.can_edit_trip(((storage.foldername(name))[1])::uuid)
  );

-- No select policy needed: the bucket is public (read via /object/public/).

-- ---------------------------------------------------------------------------
-- shared_feed: check-ins may now carry photos — whitelist ONLY the storage
-- paths (an array of strings), never the raw payload.
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
                 when 'checkin' then jsonb_build_object(
                   'placeName', e.payload->>'placeName',
                   'photos', coalesce((
                     select jsonb_agg(p) from jsonb_array_elements_text(e.payload->'photos') p
                   ), '[]'::jsonb))
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
