// digest — follower email-digest lifecycle (M3 polish). Three actions:
//   POST {action:'subscribe', token, email, frequency} — from the follow page
//     (anon, CORS). Validates the share token, upserts the subscription and
//     sends a double-opt-in confirmation email via Resend.
//   GET ?action=confirm&t=<token>  — the link in the confirmation email.
//   GET ?action=unsub&t=<token>    — the link in every digest email.
//
// Deployed with --no-verify-jwt: confirm/unsub arrive as bare clicks from
// email clients. Abuse controls: subscribe needs a live share token, sends
// only after double opt-in, and confirmation resends are capped to one per
// 10 minutes per (share, email).
//
// Secrets: RESEND_API_KEY, ALERTS_FROM (shared with stay-deadline-alerts;
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-provided).

import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('ALERTS_FROM') ?? 'Nomad Planner <onboarding@resend.dev>'
const FALLBACK_SITE = 'https://asia-nomad-trip-planner.vercel.app'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randToken(): string {
  return crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
}

// Tiny human-facing page for the email-link actions (opened in a browser).
function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<body style="margin:0;font:16px/1.5 -apple-system,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#ededed;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="max-width:26rem;padding:2rem;text-align:center">
<div style="font-size:40px">🧭</div>
<h1 style="font-size:20px;margin:12px 0 8px">${title}</h1>
<p style="color:#9a9aa2;margin:0">${body}</p>
</div></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, text }),
  })
  return res.ok
}

async function subscribe(req: Request): Promise<Response> {
  const { token, email, frequency } = await req.json().catch(() => ({}))
  const freq = frequency === 'weekly' ? 'weekly' : 'daily'
  if (typeof token !== 'string' || typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return Response.json({ error: 'invalid request' }, { status: 400, headers: CORS })
  }

  const tokenHash = await sha256hex(token)
  const { data: share } = await sb
    .from('trip_shares')
    .select('id, trip_id, revoked_at, expires_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .maybeSingle()
  if (!share || (share.expires_at && +new Date(share.expires_at) < Date.now())) {
    return Response.json({ error: 'invalid link' }, { status: 403, headers: CORS })
  }

  const normEmail = email.trim().toLowerCase()
  const { data: existing } = await sb
    .from('digest_subscriptions')
    .select('id, confirmed_at, confirm_sent_at')
    .eq('share_id', share.id)
    .eq('email', normEmail)
    .maybeSingle()

  // Already confirmed → just switch frequency, no new email.
  if (existing?.confirmed_at) {
    await sb.from('digest_subscriptions').update({ frequency: freq }).eq('id', existing.id)
    return Response.json({ status: 'updated' }, { headers: CORS })
  }

  // Pending (or new): (re)issue tokens and send the confirmation, at most
  // once per 10 minutes.
  if (existing?.confirm_sent_at && Date.now() - +new Date(existing.confirm_sent_at) < 10 * 60_000) {
    return Response.json({ status: 'pending' }, { headers: CORS })
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
  const { error: upErr } = await sb
    .from('digest_subscriptions')
    .upsert(row, { onConflict: 'share_id,email' })
  if (upErr) return Response.json({ error: 'try again' }, { status: 500, headers: CORS })

  const { data: trip } = await sb.from('trips').select('state').eq('id', share.trip_id).maybeSingle()
  const tripName: string =
    (trip?.state as { meta?: { tripName?: string } })?.meta?.tripName ?? 'the trip'

  const origin = req.headers.get('origin')
  const site = origin?.startsWith('https://') ? origin : FALLBACK_SITE
  const confirmUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/digest?action=confirm&t=${confirmRaw}`
  const ok = await sendEmail(
    normEmail,
    `Confirm: ${freq} updates from "${tripName}"`,
    [
      `You asked for a ${freq} email summary of "${tripName}".`,
      ``,
      `Confirm your subscription:`,
      confirmUrl,
      ``,
      `The live page with photos and the map stays at the follow link you were given:`,
      `${site}/follow/… (bookmark it!)`,
      ``,
      `Didn't request this? Ignore this email and nothing will be sent.`,
    ].join('\n'),
  )
  if (!ok) return Response.json({ error: 'email failed — try again' }, { status: 502, headers: CORS })
  // Cooldown stamp only AFTER a successful send — a Resend failure must not
  // block the follower's immediate retry.
  await sb.from('digest_subscriptions')
    .update({ confirm_sent_at: new Date().toISOString() })
    .eq('share_id', share.id).eq('email', normEmail)
  return Response.json({ status: 'confirm-sent' }, { headers: CORS })
}

async function confirm(raw: string): Promise<Response> {
  const hash = await sha256hex(raw)
  const { data: sub } = await sb
    .from('digest_subscriptions')
    .select('id, frequency, confirmed_at')
    .eq('confirm_token_hash', hash)
    .maybeSingle()
  if (!sub) return page('Link not valid', 'This confirmation link has expired or was already replaced by a newer one.', 410)
  if (!sub.confirmed_at) {
    await sb.from('digest_subscriptions')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('id', sub.id)
  }
  return page(
    'You’re in! 🎉',
    `You’ll get a ${sub.frequency} email summary of the trip. Every email has an unsubscribe link at the bottom.`,
  )
}

async function unsub(raw: string): Promise<Response> {
  const { data: sub } = await sb
    .from('digest_subscriptions')
    .select('id')
    .eq('unsub_token', raw)
    .maybeSingle()
  if (sub) await sb.from('digest_subscriptions').delete().eq('id', sub.id)
  // Same answer either way — an unsub link must always "work".
  return page('Unsubscribed', 'You won’t receive any more trip summary emails at this address.')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  if (req.method === 'POST') {
    const body = await req.clone().json().catch(() => ({}))
    if (body.action === 'subscribe') return subscribe(req)
    return Response.json({ error: 'unknown action' }, { status: 400, headers: CORS })
  }
  if (req.method === 'GET') {
    const t = url.searchParams.get('t') ?? ''
    if (action === 'confirm' && t) return confirm(t)
    if (action === 'unsub' && t) return unsub(t)
  }
  return page('Nothing here', 'This link is incomplete — use the buttons in the email.', 400)
})
