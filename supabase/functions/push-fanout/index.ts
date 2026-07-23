// push-fanout — sends Web Push for one follower-visible trip event.
// Invoked by the trip_events_push_fanout trigger (migration 13) via pg_net
// with the shared x-cron-secret. Free-tier: VAPID only, no vendor.
//
// Secrets (per project): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
// CRON_SECRET (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, auto-provided).
//
// Payload sent to the browser mirrors the shared_feed whitelist — nothing a
// follower couldn't already see on the page.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const CRON_SECRET = Deno.env.get('CRON_SECRET')!
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:patrik@keepyourhabits.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface EventRow {
  id: string
  trip_id: string
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
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 })
  }
  const { event_id } = await req.json().catch(() => ({}))
  if (!event_id) return new Response('missing event_id', { status: 400 })

  const { data: ev, error } = await sb
    .from('trip_events')
    .select('id,trip_id,kind,payload,visibility,check_ins(rating,comment)')
    .eq('id', event_id)
    .maybeSingle<EventRow>()
  if (error) return new Response(error.message, { status: 500 })
  if (!ev || !['followers', 'public'].includes(ev.visibility)) {
    return Response.json({ sent: 0, reason: 'not follower-visible' })
  }

  const { data: trip } = await sb
    .from('trips').select('state').eq('id', ev.trip_id).maybeSingle()
  const tripName: string =
    (trip?.state as { meta?: { tripName?: string } })?.meta?.tripName ?? 'Trip update'

  // Subscriptions of LIVE (unrevoked, unexpired) shares of this trip.
  const { data: subs, error: subErr } = await sb
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth,trip_shares!inner(trip_id,revoked_at,expires_at)')
    .eq('trip_shares.trip_id', ev.trip_id)
    .is('trip_shares.revoked_at', null)
  if (subErr) return new Response(subErr.message, { status: 500 })

  const now = Date.now()
  const live = (subs ?? []).filter((s) => {
    const share = s.trip_shares as unknown as { expires_at: string | null }
    return !share.expires_at || +new Date(share.expires_at) > now
  })

  const note = JSON.stringify(notification(ev, tripName))
  let sent = 0, dropped = 0
  await Promise.all(live.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        note,
      )
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) {
        // endpoint gone (unsubscribed / browser reset) → prune
        await sb.from('push_subscriptions').delete().eq('id', s.id)
        dropped++
      }
    }
  }))

  return Response.json({ event: ev.kind, subs: live.length, sent, dropped })
})
