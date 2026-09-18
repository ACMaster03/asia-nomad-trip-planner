// push-fanout — sends Web Push for one trip event, comment or reaction.
// Invoked by the fan-out triggers (migrations 13 → 27 → 30 → 37) via pg_net
// with the signed x-cron-ts / x-cron-sig headers. Free-tier: VAPID only.
//
// Bodies, one key each:
//   { event_id }                      a new trip_events row
//   { comment_id }                    a new event_comments row
//   { reaction: { event_id, user_id } }  a new event_reactions row
//
// WHO gets what is decided in the database (37's push_audience_* readers,
// service_role only): the roster of the trip, the author's followers, the
// post author, the parent comment's author — every preference, mute and
// block already applied. This function only turns the answer into
// notifications and finds the devices:
//
//   anonymous link devices — push_subscriptions by share (13/16), only for
//                            follower-visible events; paused / revoked /
//                            expired shares are muted. Unchanged since 27.
//   accounts               — user_push_subscriptions (27) for the user ids
//                            the reader returned. Copy differs per reason.
//
// Secrets (per project): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
// CRON_SECRET (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, auto-provided).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendWebPush, type PushNote, type WebPushTarget } from '../_shared/webpush.ts'
import { hasCronSecret } from '../_shared/cronAuth.ts'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Reason = 'trip' | 'follow' | 'reply' | 'comment' | 'reaction'
interface Target { user_id: string; reason: Reason }

interface EventCtx {
  event_id: string
  trip_id: string
  tripName: string
  authorName: string
  kind: string
  visibility: string
  title: string
  rating: number | null
  comment: string | null
  targets: Target[]
}
interface CommentCtx {
  event_id: string
  trip_id: string
  tripName: string
  authorName: string
  body: string
  title: string
  targets: Target[]
}
interface ReactionCtx {
  event_id: string
  trip_id: string
  tripName: string
  authorName: string
  glyph: string
  title: string
  targets: Target[]
}

// ---- copy -----------------------------------------------------------------

const EVENT_GLYPH: Record<string, string> = { checkin: '📍', arrived: '🛬', note: '📝' }

// A co-traveller's view: the place is the headline, as it was under 27.
function tripNote(c: EventCtx): PushNote {
  const stars = c.rating ? '★'.repeat(c.rating) + ' ' : ''
  switch (c.kind) {
    case 'checkin':
      return { title: `📍 ${c.title}`, body: `${stars}${c.comment ?? `New check-in on ${c.tripName}`}` }
    case 'arrived':
      return { title: `🛬 ${c.title}`, body: c.tripName }
    case 'note':
      return { title: `📝 ${c.tripName}`, body: c.title }
    default:
      return { title: c.tripName, body: 'New update' }
  }
}

// A follower's view: the person comes first — they follow Anna, not a trip.
function followNote(c: EventCtx): PushNote {
  const stars = c.rating ? '★'.repeat(c.rating) + ' ' : ''
  switch (c.kind) {
    case 'checkin':
      return { title: `📍 ${c.authorName} · ${c.title}`, body: `${stars}${c.comment ?? c.tripName}` }
    case 'arrived':
      return { title: `🛬 ${c.title}`, body: `${c.authorName} · ${c.tripName}` }
    case 'note':
      return { title: `📝 ${c.authorName}`, body: c.title }
    default:
      return { title: `${EVENT_GLYPH[c.kind] ?? ''} ${c.authorName}`.trim(), body: `New update on ${c.tripName}` }
  }
}

// ---- devices ----------------------------------------------------------------

async function accountTargets(userIds: string[]): Promise<Map<string, WebPushTarget[]>> {
  const byUser = new Map<string, WebPushTarget[]>()
  if (!userIds.length) return byUser
  const { data, error } = await sb
    .from('user_push_subscriptions')
    .select('id,user_id,endpoint,p256dh,auth')
    .eq('transport', 'webpush')
    .in('user_id', userIds)
  if (error) throw new Error(error.message)
  for (const s of data ?? []) {
    const t: WebPushTarget = { id: s.id, endpoint: s.endpoint, p256dh: s.p256dh!, auth: s.auth!, table: 'user_push_subscriptions' }
    byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), t])
  }
  return byUser
}

// One send per reason: the same people may need different copy.
async function sendByReason(
  targets: Target[],
  note: (reason: Reason) => PushNote,
): Promise<Record<string, { subs: number; sent: number; dropped: number }>> {
  const devices = await accountTargets(targets.map((t) => t.user_id))
  const groups = new Map<Reason, WebPushTarget[]>()
  for (const t of targets) {
    const d = devices.get(t.user_id)
    if (d?.length) groups.set(t.reason, [...(groups.get(t.reason) ?? []), ...d])
  }
  const out: Record<string, { subs: number; sent: number; dropped: number }> = {}
  await Promise.all([...groups].map(async ([reason, list]) => {
    const r = await sendWebPush(sb, list, note(reason))
    out[reason] = { subs: list.length, ...r }
  }))
  return out
}

// ---- handlers ----------------------------------------------------------------

async function handleEvent(eventId: string): Promise<Response> {
  const { data, error } = await sb.rpc('push_audience_event', { p_event: eventId })
  if (error) return new Response(error.message, { status: 500 })
  const ctx = data as EventCtx | null
  if (!ctx) return Response.json({ sent: 0, reason: 'no such event' })

  // ---- anonymous link devices (13/16): live shares of this trip only -------
  const linkTargets: WebPushTarget[] = []
  if (['followers', 'public'].includes(ctx.visibility)) {
    const { data: subs, error: subErr } = await sb
      .from('push_subscriptions')
      .select('id,endpoint,p256dh,auth,trip_shares!inner(trip_id,revoked_at,expires_at,paused_at)')
      .eq('trip_shares.trip_id', ctx.trip_id)
      .is('trip_shares.revoked_at', null)
      .is('trip_shares.paused_at', null)
    if (subErr) return new Response(subErr.message, { status: 500 })
    const now = Date.now()
    for (const s of subs ?? []) {
      const share = s.trip_shares as unknown as { expires_at: string | null }
      if (!share.expires_at || +new Date(share.expires_at) > now) {
        linkTargets.push({ id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, table: 'push_subscriptions' })
      }
    }
  }

  // Link devices route via device-local state (the DB never holds raw
  // tokens, so no URL in the payload). Accounts open the post.
  const url = `/post/${ctx.event_id}`
  const [links, accounts] = await Promise.all([
    sendWebPush(sb, linkTargets, followNote(ctx)),
    sendByReason(ctx.targets, (reason) => ({ ...(reason === 'follow' ? followNote(ctx) : tripNote(ctx)), url })),
  ])
  return Response.json({ event: ctx.kind, links: { subs: linkTargets.length, ...links }, accounts })
}

async function handleComment(commentId: string): Promise<Response> {
  const { data, error } = await sb.rpc('push_audience_comment', { p_comment: commentId })
  if (error) return new Response(error.message, { status: 500 })
  const ctx = data as CommentCtx | null
  if (!ctx) return Response.json({ sent: 0, reason: 'no such comment' })
  const url = `/post/${ctx.event_id}`
  const accounts = await sendByReason(ctx.targets, (reason) => ({
    title: reason === 'reply' ? `💬 ${ctx.authorName} replied to you` : `💬 ${ctx.authorName} on ${ctx.title}`,
    body: ctx.body,
    url,
  }))
  return Response.json({ comment: commentId, accounts })
}

async function handleReaction(eventId: string, userId: string): Promise<Response> {
  const { data, error } = await sb.rpc('push_audience_reaction', { p_event: eventId, p_user: userId })
  if (error) return new Response(error.message, { status: 500 })
  const ctx = data as ReactionCtx | null
  if (!ctx) return Response.json({ sent: 0, reason: 'no such reaction' })
  const accounts = await sendByReason(ctx.targets, () => ({
    title: `${ctx.glyph} ${ctx.authorName} reacted to ${ctx.title}`,
    body: ctx.tripName,
    url: `/post/${ctx.event_id}`,
  }))
  return Response.json({ reaction: eventId, accounts })
}

Deno.serve(async (req) => {
  if (!(await hasCronSecret(req))) {
    return new Response('forbidden', { status: 403 })
  }
  const body = await req.json().catch(() => ({})) as {
    event_id?: string
    comment_id?: string
    reaction?: { event_id?: string; user_id?: string }
  }
  try {
    if (body.comment_id) return await handleComment(body.comment_id)
    if (body.reaction?.event_id && body.reaction.user_id) {
      return await handleReaction(body.reaction.event_id, body.reaction.user_id)
    }
    if (body.event_id) return await handleEvent(body.event_id)
  } catch (e) {
    return new Response((e as Error).message, { status: 500 })
  }
  return new Response('missing event_id, comment_id or reaction', { status: 400 })
})
