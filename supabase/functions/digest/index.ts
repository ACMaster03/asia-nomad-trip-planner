// digest — follower email-digest lifecycle (M3 polish). The subscription
// lifecycle lives HERE and nowhere else: digest_subscriptions is deny-all RLS,
// so every read and write goes through this function's service role.
//
//   POST {action:'subscribe',   token, email, frequency}  — from the follow page
//   POST {action:'confirm',     t}   — from /digest/confirm (the app renders it)
//   POST {action:'unsub',       t}   — from /digest/unsubscribe and one-click
//   POST {action:'resubscribe', t}   — the "keep sending them" undo
//   GET  ?action=confirm|unsub&t=…   — 302 to the branded app page
//
// The GET arms exist only for links already sitting in someone's inbox from
// before migration 17: emails used to point straight at this function and get
// back four unstyled lines. Human-facing HTML now lives in the Next.js app —
// this function answers JSON and never renders a page.
//
// Deployed with --no-verify-jwt: one-click unsubscribe POSTs arrive from
// Google's servers, and legacy GETs from mail clients. Abuse controls:
// subscribe needs a live share token, sends only after double opt-in, and
// confirmation resends are capped to one per 10 minutes per (share, email).
//
// Secrets: RESEND_API_KEY, ALERTS_FROM, SITE_URL (optional — defaults to the
// production domain; SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-provided).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/resend.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('ALERTS_FROM') ?? 'Nomad Planner <onboarding@resend.dev>'
const FALLBACK_SITE = 'https://asia-nomad-trip-planner.vercel.app'
const SITE = (Deno.env.get('SITE_URL') ?? FALLBACK_SITE).replace(/\/+$/, '')

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const confirmPageUrl = (t: string) => `${SITE}/digest/confirm?t=${t}`
const unsubPageUrl = (t: string) => `${SITE}/digest/unsubscribe?t=${t}`
// The follow page accepts a subscriber's view token as well as a raw share
// token (migration 17) — this is the link the emails could never build before.
const followUrl = (viewToken: string) => `${SITE}/follow/${viewToken}`

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randToken(): string {
  return crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: CORS })

async function tripNameForShare(shareId: string): Promise<string> {
  const { data: share } = await sb
    .from('trip_shares').select('trip_id').eq('id', shareId).maybeSingle()
  if (!share) return 'the trip'
  const { data: trip } = await sb
    .from('trips').select('state').eq('id', share.trip_id).maybeSingle()
  return (trip?.state as { meta?: { tripName?: string } })?.meta?.tripName ?? 'the trip'
}

// The follower gets a deliberately vague message (they can't act on a provider
// error), but _shared/resend.ts logs the full reason + hint to the function log.
const send = (to: string, subject: string, text: string) =>
  sendEmail(RESEND_API_KEY, { from: FROM, to, subject, text })

async function subscribe(req: Request): Promise<Response> {
  const { token, email, frequency } = await req.json().catch(() => ({}))
  const freq = frequency === 'weekly' ? 'weekly' : 'daily'
  if (typeof token !== 'string' || typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ error: 'invalid request' }, 400)
  }

  const tokenHash = await sha256hex(token)
  const { data: share } = await sb
    .from('trip_shares')
    .select('id, trip_id, revoked_at, expires_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .maybeSingle()
  if (!share || (share.expires_at && +new Date(share.expires_at) < Date.now())) {
    return json({ error: 'invalid link' }, 403)
  }

  const normEmail = email.trim().toLowerCase()
  const { data: existing } = await sb
    .from('digest_subscriptions')
    .select('id, confirmed_at, confirm_sent_at, unsubscribed_at')
    .eq('share_id', share.id)
    .eq('email', normEmail)
    .maybeSingle()

  // Live and confirmed → just switch frequency, no new email. A row that was
  // unsubscribed falls through to a fresh double opt-in on purpose: an
  // explicit opt-out is only reversed by the person holding the mailbox.
  if (existing?.confirmed_at && !existing.unsubscribed_at) {
    await sb.from('digest_subscriptions').update({ frequency: freq }).eq('id', existing.id)
    return json({ status: 'updated' })
  }

  // Pending (or new, or previously unsubscribed): (re)issue tokens and send
  // the confirmation, at most once per 10 minutes.
  if (existing?.confirm_sent_at && Date.now() - +new Date(existing.confirm_sent_at) < 10 * 60_000) {
    return json({ status: 'pending' })
  }

  const confirmRaw = randToken()
  const unsubRaw = randToken()
  const row = {
    share_id: share.id,
    email: normEmail,
    frequency: freq,
    confirm_token_hash: await sha256hex(confirmRaw),
    unsub_token: unsubRaw,
  }
  // view_token is omitted deliberately: on INSERT the column default mints one,
  // on CONFLICT the existing subscriber keeps the link they may have bookmarked.
  const { data: saved, error: upErr } = await sb
    .from('digest_subscriptions')
    .upsert(row, { onConflict: 'share_id,email' })
    .select('view_token')
    .single()
  if (upErr || !saved) return json({ error: 'try again' }, 500)

  const tripName = await tripNameForShare(share.id)
  const sent = await send(
    normEmail,
    `Confirm: ${freq} updates from "${tripName}"`,
    [
      `You asked for a ${freq} email summary of "${tripName}".`,
      ``,
      `Confirm your subscription:`,
      confirmPageUrl(confirmRaw),
      ``,
      `Your live page — photos, the map and the latest check-ins:`,
      followUrl(saved.view_token),
      `(bookmark this one — it works even without the emails)`,
      ``,
      `Didn't request this? Ignore this email and nothing will be sent.`,
    ].join('\n'),
  )
  if (!sent.ok) return json({ error: 'email failed — try again' }, 502)
  // Cooldown stamp only AFTER a successful send — a Resend failure must not
  // block the follower's immediate retry.
  await sb.from('digest_subscriptions')
    .update({ confirm_sent_at: new Date().toISOString() })
    .eq('share_id', share.id).eq('email', normEmail)
  return json({ status: 'confirm-sent' })
}

async function confirm(raw: string): Promise<Response> {
  const hash = await sha256hex(raw)
  const { data: sub } = await sb
    .from('digest_subscriptions')
    .select('id, share_id, email, frequency, confirmed_at, unsubscribed_at, view_token')
    .eq('confirm_token_hash', hash)
    .maybeSingle()
  // No row → the token was used, replaced by a newer request, or never existed.
  // We cannot tell which, and cannot name the trip: there is nothing to look up.
  if (!sub) return json({ status: 'invalid' })

  const alreadyLive = !!sub.confirmed_at && !sub.unsubscribed_at
  if (!alreadyLive) {
    await sb.from('digest_subscriptions')
      .update({ confirmed_at: sub.confirmed_at ?? new Date().toISOString(), unsubscribed_at: null })
      .eq('id', sub.id)
  }
  return json({
    status: alreadyLive ? 'already' : 'confirmed',
    email: sub.email,
    frequency: sub.frequency,
    tripName: await tripNameForShare(sub.share_id),
    viewUrl: followUrl(sub.view_token),
  })
}

// Soft delete: the row survives as a suppression record, so a repeat one-click
// POST is idempotent and the undo below has something to restore. The view
// token keeps working — unsubscribing stops emails, not access.
async function unsub(raw: string): Promise<Response> {
  const { data: sub } = await sb
    .from('digest_subscriptions')
    .select('id, share_id, email, frequency, unsubscribed_at, view_token')
    .eq('unsub_token', raw)
    .maybeSingle()
  // Unknown token still reports success — an unsubscribe link must never fail.
  if (!sub) return json({ status: 'unknown' })

  if (!sub.unsubscribed_at) {
    await sb.from('digest_subscriptions')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', sub.id)
  }
  return json({
    status: 'unsubscribed',
    email: sub.email,
    // Returned so the undo can name what it is switching back on.
    frequency: sub.frequency,
    tripName: await tripNameForShare(sub.share_id),
    viewUrl: followUrl(sub.view_token),
  })
}

// Undo, straight off the Unsubscribed page. No second opt-in: this address
// already confirmed once, and the caller is holding its unsubscribe token.
async function resubscribe(raw: string): Promise<Response> {
  const { data: sub } = await sb
    .from('digest_subscriptions')
    .select('id, share_id, email, frequency, confirmed_at, view_token')
    .eq('unsub_token', raw)
    .maybeSingle()
  if (!sub) return json({ status: 'unknown' })

  await sb.from('digest_subscriptions')
    .update({ unsubscribed_at: null, confirmed_at: sub.confirmed_at ?? new Date().toISOString() })
    .eq('id', sub.id)
  return json({
    status: 'resubscribed',
    email: sub.email,
    frequency: sub.frequency,
    tripName: await tripNameForShare(sub.share_id),
    viewUrl: followUrl(sub.view_token),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const url = new URL(req.url)

  if (req.method === 'POST') {
    const body = await req.clone().json().catch(() => ({}))
    const t = typeof body.t === 'string' ? body.t : ''
    switch (body.action) {
      case 'subscribe':   return subscribe(req)
      case 'confirm':     return t ? confirm(t)     : json({ status: 'invalid' })
      case 'unsub':       return t ? unsub(t)       : json({ status: 'unknown' })
      case 'resubscribe': return t ? resubscribe(t) : json({ status: 'unknown' })
    }
    return json({ error: 'unknown action' }, 400)
  }

  // Legacy email links → the branded pages.
  if (req.method === 'GET') {
    const t = url.searchParams.get('t') ?? ''
    const action = url.searchParams.get('action')
    if (action === 'confirm' && t) return Response.redirect(confirmPageUrl(t), 302)
    if (action === 'unsub' && t) return Response.redirect(unsubPageUrl(t), 302)
    return Response.redirect(SITE, 302)
  }
  return json({ error: 'unsupported' }, 405)
})
