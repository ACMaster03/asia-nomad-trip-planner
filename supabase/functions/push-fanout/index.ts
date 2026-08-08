// push-fanout — sends Web Push for one trip event.
// Invoked by the trip_events_push_fanout trigger (migrations 13 + 27) via
// pg_net with the shared x-cron-secret. Free-tier: VAPID only, no vendor.
//
// Two audiences, decided here (the trigger fires for EVERY insert since 27):
//   followers  — share-link subscriptions (13), only for follower-visible
//                events; paused/revoked/expired shares are muted. Payload
//                mirrors the shared_feed whitelist.
//   travellers — the trip owner + members (27), for ALL visibilities, minus
//                the event's author (you don't need a push about your own
//                check-in), gated on profiles.notify_event_push.
//
// Secrets (per project): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
// CRON_SECRET (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, auto-provided).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendWebPush, type WebPushTarget } from '../_shared/webpush.ts'
import { hasCronSecret } from '../_shared/cronAuth.ts'


const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface EventRow {
  id: string
  trip_id: string
  author: string | null
  kind: string
  payload: { placeName?: string; text?: string; city?: string }
  visibility: string
  check_ins: { rating: number | null; comment: string | null } | null
}

function notification(ev: EventRow, tripName: string) {
  const stars = ev.check_ins?.rating ? '★'.repeat(ev.check_ins.rating) + ' ' : ''
  switch (ev.kind) {
    case 'checkin':
      return {
        title: `📍 ${ev.payload.placeName ?? 'New check-in'}`,
        body: `${stars}${ev.check_ins?.comment ?? `New check-in on ${tripName}`}`,
      }
    case 'arrived':
      return { title: `🛬 Arrived in ${ev.payload.city ?? '…'}`, body: tripName }
    case 'note':
      return { title: `📝 ${tripName}`, body: ev.payload.text ?? 'New note' }
    default:
      return { title: tripName, body: 'New update' }
  }
}

Deno.serve(async (req) => {
  if (!(await hasCronSecret(req))) {
    return new Response('forbidden', { status: 403 })
  }
  const { event_id } = await req.json().catch(() => ({}))
  if (!event_id) return new Response('missing event_id', { status: 400 })

  const { data: ev, error } = await sb
    .from('trip_events')
    .select('id,trip_id,author,kind,payload,visibility,check_ins(rating,comment)')
    .eq('id', event_id)
    .maybeSingle<EventRow>()
  if (error) return new Response(error.message, { status: 500 })
  if (!ev) return Response.json({ sent: 0, reason: 'no such event' })

  const { data: trip } = await sb
    .from('trips').select('owner,state').eq('id', ev.trip_id).maybeSingle()
  const tripName: string =
    (trip?.state as { meta?: { tripName?: string } })?.meta?.tripName ?? 'Trip update'

  const note = notification(ev, tripName)

  // ---- audience 1: followers (share-link subs, follower-visible only) ------
  const followerTargets: WebPushTarget[] = []
  if (['followers', 'public'].includes(ev.visibility)) {
    // Subscriptions of LIVE (unrevoked, unexpired, unpaused) shares of this
    // trip. Paused shares keep their subscriptions but are muted (mock 09).
    const { data: subs, error: subErr } = await sb
      .from('push_subscriptions')
      .select('id,endpoint,p256dh,auth,trip_shares!inner(trip_id,revoked_at,expires_at,paused_at)')
      .eq('trip_shares.trip_id', ev.trip_id)
      .is('trip_shares.revoked_at', null)
      .is('trip_shares.paused_at', null)
    if (subErr) return new Response(subErr.message, { status: 500 })
    const now = Date.now()
    for (const s of subs ?? []) {
      const share = s.trip_shares as unknown as { expires_at: string | null }
      if (!share.expires_at || +new Date(share.expires_at) > now) {
        followerTargets.push({ ...s, table: 'push_subscriptions' })
      }
    }
  }

  // ---- audience 2: travellers (owner + members, minus author, prefs on) ----
  const { data: members } = await sb
    .from('trip_members').select('user_id').eq('trip_id', ev.trip_id)
  const memberIds = [...new Set(
    [trip?.owner, ...(members ?? []).map((m: { user_id: string }) => m.user_id)]
      .filter((id): id is string => !!id && id !== ev.author),
  )]

  const travellerTargets: WebPushTarget[] = []
  if (memberIds.length) {
    const { data: prefs } = await sb
      .from('profiles').select('id,notify_event_push').in('id', memberIds)
    const wantsPush = new Set(
      (prefs ?? []).filter((p) => p.notify_event_push).map((p) => p.id),
    )
    if (wantsPush.size) {
      const { data: userSubs } = await sb
        .from('user_push_subscriptions')
        .select('id,user_id,endpoint,p256dh,auth')
        .eq('transport', 'webpush')
        .in('user_id', [...wantsPush])
      for (const s of userSubs ?? []) {
        travellerTargets.push({
          id: s.id, endpoint: s.endpoint, p256dh: s.p256dh!, auth: s.auth!,
          table: 'user_push_subscriptions',
        })
      }
    }
  }

  // Follower clicks route via device-local state (their device stored the
  // follow URL at subscribe time — the DB never holds raw tokens, so we
  // can't put their URL in a payload). Traveller clicks open /live.
  const [followers, travellers] = await Promise.all([
    sendWebPush(sb, followerTargets, note),
    sendWebPush(sb, travellerTargets, { ...note, url: '/live' }),
  ])

  return Response.json({
    event: ev.kind,
    followers: { subs: followerTargets.length, ...followers },
    travellers: { subs: travellerTargets.length, ...travellers },
  })
})
