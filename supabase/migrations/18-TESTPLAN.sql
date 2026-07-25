-- Assertions for migration 18. Transactional, rolls back.
begin;

do $$
declare
  v_share public.trip_shares;
  v_trip  uuid;
  v_topic text;
  v_author uuid;
  v_before int;
  v_after  int;
  v_sum    jsonb;
  v_raw    text;
begin
  select * into v_share from public.trip_shares where label = 'Family' limit 1;
  v_trip := v_share.trip_id;
  v_topic := v_share.broadcast_topic;
  select owner into v_author from public.trips where id = v_trip;

  if v_topic is null or length(v_topic) <> 64 then
    raise exception 'FAIL: broadcast_topic missing/short (%)', v_topic;
  end if;
  raise notice 'OK  broadcast_topic present (% chars)', length(v_topic);

  -- 1. A follower-visible INSERT emits exactly one message on the topic.
  select count(*) into v_before from realtime.messages where topic = v_topic;
  insert into public.trip_events (trip_id, author, kind, visibility, occurred_at, payload)
  values (v_trip, v_author, 'note', 'followers', now(), '{"text":"broadcast assert"}'::jsonb);
  select count(*) into v_after from realtime.messages where topic = v_topic;
  if v_after <> v_before + 1 then
    raise exception 'FAIL: expected 1 broadcast, got %', v_after - v_before;
  end if;
  raise notice 'OK  follower-visible insert -> 1 ping';

  -- 2. The payload carries NOTHING (the core privacy promise).
  if (select payload->'payload' from realtime.messages
       where topic = v_topic order by inserted_at desc limit 1) <> '{}'::jsonb then
    raise exception 'FAIL: broadcast payload is not empty: %',
      (select payload from realtime.messages where topic = v_topic order by inserted_at desc limit 1);
  end if;
  raise notice 'OK  payload is empty — cache-invalidation ping, not a data channel';

  -- 3. A trip-only event must NOT ping.
  select count(*) into v_before from realtime.messages where topic = v_topic;
  insert into public.trip_events (trip_id, author, kind, visibility, occurred_at, payload)
  values (v_trip, v_author, 'note', 'trip', now(), '{"text":"private"}'::jsonb);
  select count(*) into v_after from realtime.messages where topic = v_topic;
  if v_after <> v_before then
    raise exception 'FAIL: trip-only event leaked a ping';
  end if;
  raise notice 'OK  trip-only event -> no ping';

  -- 4. PAUSED shares are muted, and cannot even learn their topic.
  update public.trip_shares set paused_at = now() where id = v_share.id;
  select count(*) into v_before from realtime.messages where topic = v_topic;
  insert into public.trip_events (trip_id, author, kind, visibility, occurred_at, payload)
  values (v_trip, v_author, 'note', 'followers', now(), '{"text":"while paused"}'::jsonb);
  select count(*) into v_after from realtime.messages where topic = v_topic;
  if v_after <> v_before then
    raise exception 'FAIL: paused share still received a ping';
  end if;
  raise notice 'OK  paused share -> no ping';
  update public.trip_shares set paused_at = null where id = v_share.id;

  -- 5. REVOKED shares are muted too.
  update public.trip_shares set revoked_at = now() where id = v_share.id;
  select count(*) into v_before from realtime.messages where topic = v_topic;
  insert into public.trip_events (trip_id, author, kind, visibility, occurred_at, payload)
  values (v_trip, v_author, 'note', 'followers', now(), '{"text":"after revoke"}'::jsonb);
  select count(*) into v_after from realtime.messages where topic = v_topic;
  if v_after <> v_before then
    raise exception 'FAIL: revoked share still received a ping';
  end if;
  raise notice 'OK  revoked share -> no ping';
  update public.trip_shares set revoked_at = null where id = v_share.id;

  -- 6. An edit that RETRACTS an event (followers -> trip) still pings, so the
  --    follower's screen drops it instead of showing it until the next poll.
  select count(*) into v_before from realtime.messages where topic = v_topic;
  update public.trip_events set visibility = 'trip'
   where trip_id = v_trip and payload->>'text' = 'broadcast assert';
  select count(*) into v_after from realtime.messages where topic = v_topic;
  if v_after <> v_before + 1 then
    raise exception 'FAIL: retraction did not ping (got %)', v_after - v_before;
  end if;
  raise notice 'OK  retraction edit -> ping (follower drops it promptly)';

  raise notice '--- ALL MIGRATION 18 ASSERTIONS PASSED ---';
end $$;

rollback;
