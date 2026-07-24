// digest-send — builds and sends the follower email digests (daily/weekly).
// Invoked once a day by pg_cron (13:00 UTC = 20:00 ICT = 15:00 CEST — end of
// a travel day) with the shared x-cron-secret header.
//
// A subscription is due when confirmed AND its share is live (unrevoked,
// unexpired, UNPAUSED) AND enough time has passed: daily ≥ 20h since the
// last send, weekly ≥ 6d20h. "Nothing happened" days send nothing and do
// NOT advance last_sent_at, so the next digest covers the whole gap
// (capped at 8 days).
//
// Secrets: RESEND_API_KEY, CRON_SECRET, ALERTS_FROM (project-wide, already
// set for the alerts function).

import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const FROM = Deno.env.get('ALERTS_FROM') ?? 'Nomad Planner <onboarding@resend.dev>'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const DAILY_MIN_GAP = 20 * 3_600_000
const WEEKLY_MIN_GAP = (6 * 24 + 20) * 3_600_000
const MAX_WINDOW = 8 * 24 * 3_600_000

interface SubRow {
  id: string
  email: string
  frequency: 'daily' | 'weekly'
  confirmed_at: string
  last_sent_at: string | null
  unsub_token: string
  trip_shares: { trip_id: string; revoked_at: string | null; expires_at: string | null; paused_at: string | null }
}

interface EventRow {
  kind: string
  occurred_at: string
  payload: { placeName?: string; text?: string; city?: string; photos?: string[] }
  check_ins: { rating: number | null; comment: string | null } | null
}

function eventLine(e: EventRow): string {
  const stars = e.check_ins?.rating ? ' ' + '★'.repeat(e.check_ins.rating) : ''
  const cmt = e.check_ins?.comment ? ` — “${e.check_ins.comment}”` : ''
  const photos = e.payload.photos?.length ? ` (${e.payload.photos.length} photo${e.payload.photos.length > 1 ? 's' : ''})` : ''
  switch (e.kind) {
    case 'checkin': return `  📍 ${e.payload.placeName ?? 'Check-in'}${stars}${cmt}${photos}`
    case 'arrived': return `  🛬 Arrived in ${e.payload.city ?? '…'}`
    case 'note':    return `  📝 ${e.payload.text ?? ''}`
    default:        return `  • Update`
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  const { data: subs, error } = await sb
    .from('digest_subscriptions')
    .select('id,email,frequency,confirmed_at,last_sent_at,unsub_token,trip_shares!inner(trip_id,revoked_at,expires_at,paused_at)')
    .not('confirmed_at', 'is', null)
    .is('trip_shares.revoked_at', null)
    .is('trip_shares.paused_at', null)
  if (error) return new Response(error.message, { status: 500 })

  const now = Date.now()
  const due = ((subs ?? []) as unknown as SubRow[]).filter((s) => {
    const share = s.trip_shares
    if (share.expires_at && +new Date(share.expires_at) < now) return false
    const gap = s.frequency === 'weekly' ? WEEKLY_MIN_GAP : DAILY_MIN_GAP
    // Never sent → due at the first cron run after confirmation.
    return s.last_sent_at === null || now - +new Date(s.last_sent_at) >= gap
  })

  // One event fetch + one trip-name fetch per trip, shared across its subs.
  const tripIds = [...new Set(due.map((s) => s.trip_shares.trip_id))]
  const tripEvents = new Map<string, EventRow[]>()
  const tripNames = new Map<string, string>()
  for (const tripId of tripIds) {
    const { data: trip } = await sb.from('trips').select('state').eq('id', tripId).maybeSingle()
    tripNames.set(tripId,
      (trip?.state as { meta?: { tripName?: string } })?.meta?.tripName ?? 'Trip update')
    const { data: evs } = await sb
      .from('trip_events')
      .select('kind,occurred_at,payload,check_ins(rating,comment)')
      .eq('trip_id', tripId)
      .in('visibility', ['followers', 'public'])
      .gt('occurred_at', new Date(now - MAX_WINDOW).toISOString())
      .order('occurred_at', { ascending: true })
      .limit(60)
    tripEvents.set(tripId, (evs ?? []) as unknown as EventRow[])
  }

  let sent = 0
  const results: string[] = []
  for (const s of due) {
    const since = Math.max(
      +new Date(s.last_sent_at ?? s.confirmed_at),
      now - MAX_WINDOW,
    )
    const events = (tripEvents.get(s.trip_shares.trip_id) ?? [])
      .filter((e) => +new Date(e.occurred_at) > since)
    if (events.length === 0) continue // quiet stretch → no email, window keeps growing

    const tripName = tripNames.get(s.trip_shares.trip_id) ?? 'Trip update'
    // Group by day for readability.
    const byDay = new Map<string, EventRow[]>()
    for (const e of events) {
      const day = new Date(e.occurred_at).toISOString().slice(0, 10)
      byDay.set(day, [...(byDay.get(day) ?? []), e])
    }
    const body: string[] = [
      `${s.frequency === 'weekly' ? 'This week' : 'Today'} on "${tripName}":`,
      ``,
    ]
    for (const [day, evs] of byDay) {
      body.push(new Date(day + 'T00:00:00Z').toDateString())
      body.push(...evs.map(eventLine), '')
    }
    body.push(
      `Photos and the live map are on the follow page link you were given.`,
      ``,
      `—`,
      `Unsubscribe: ${Deno.env.get('SUPABASE_URL')}/functions/v1/digest?action=unsub&t=${s.unsub_token}`,
    )

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: s.email,
        subject: `🧭 ${tripName} — ${events.length} update${events.length > 1 ? 's' : ''}`,
        text: body.join('\n'),
      }),
    })
    if (res.ok) {
      await sb.from('digest_subscriptions')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('id', s.id)
      sent++
      results.push(`${s.frequency} -> ${s.email}: ${events.length} events`)
    } else {
      results.push(`FAILED ${s.email}: ${res.status}`) // last_sent_at untouched → retries tomorrow
    }
  }

  return Response.json({ due: due.length, sent, results })
})
