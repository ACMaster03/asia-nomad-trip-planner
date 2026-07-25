// fx-refresh — pulls the daily FX snapshot into public.fx_rates (M4).
//
// Two callers, two auth paths:
//   pg_cron       — x-cron-secret header (job 'fx-refresh-daily', 02:00 UTC)
//   Refresh now   — a signed-in user's JWT, rate-limited to once a minute
//
// Deployed --no-verify-jwt because the cron arm carries no JWT at all; the user
// arm is verified explicitly below instead.
//
// RATES ARE STORED AGAINST A CANONICAL USD BASE. The feed is asked for base=USD
// and its numbers are stored verbatim (per_usd = units per 1 USD), so any pair
// is arithmetic and changing the trip's base currency never needs a re-fetch.
// See supabase/migrations/19-fx-rates.sql.
//
// Secrets: CRON_SECRET (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-provided).

import { createClient } from 'npm:@supabase/supabase-js@2'

const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const FEED = 'https://open.er-api.com/v6/latest/USD'
const MANUAL_COOLDOWN_MS = 60_000

const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: CORS })

/** Record the attempt whatever happens — a silent failure is what hid the email outage. */
async function stampFailure(error: string) {
  await sb.from('fx_status').update({
    last_attempt_at: new Date().toISOString(),
    last_error: error,
  }).eq('id', true)
}

async function refresh(): Promise<Response> {
  await sb.from('fx_status')
    .update({ last_attempt_at: new Date().toISOString() })
    .eq('id', true)

  let payload: { result?: string; base_code?: string; rates?: Record<string, number> }
  try {
    const res = await fetch(FEED, { headers: { accept: 'application/json' } })
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200)
      const error = `feed ${res.status}: ${body}`
      console.error('[fx-refresh]', error)
      await stampFailure(error)
      return json({ ok: false, error }, 502)
    }
    payload = await res.json()
  } catch (e) {
    const error = `feed unreachable: ${e instanceof Error ? e.message : String(e)}`
    console.error('[fx-refresh]', error)
    await stampFailure(error)
    return json({ ok: false, error }, 502)
  }

  // The feed answers 200 with result:"error" for its own failures — a 200 is
  // not proof of a usable body.
  if (payload.result !== 'success' || payload.base_code !== 'USD' || !payload.rates) {
    const error = `feed returned unusable payload (result=${payload.result}, base=${payload.base_code})`
    console.error('[fx-refresh]', error)
    await stampFailure(error)
    return json({ ok: false, error }, 502)
  }

  const rows = Object.entries(payload.rates)
    .filter(([code, v]) =>
      /^[A-Z]{3}$/.test(code) && typeof v === 'number' && isFinite(v) && v > 0)
    .map(([code, per_usd]) => ({ code, per_usd, updated_at: new Date().toISOString() }))

  // A shrunken payload means something is wrong upstream; overwriting a good
  // snapshot with it would be worse than skipping this run.
  if (rows.length < 100) {
    const error = `feed returned only ${rows.length} usable currencies — refusing to overwrite`
    console.error('[fx-refresh]', error)
    await stampFailure(error)
    return json({ ok: false, error }, 502)
  }

  const { error: upErr } = await sb.from('fx_rates').upsert(rows, { onConflict: 'code' })
  if (upErr) {
    const error = `upsert failed: ${upErr.message}`
    console.error('[fx-refresh]', error)
    await stampFailure(error)
    return json({ ok: false, error }, 500)
  }

  await sb.from('fx_status').update({
    last_success_at: new Date().toISOString(),
    last_error: null,
    source: FEED,
    currencies: rows.length,
  }).eq('id', true)

  return json({ ok: true, currencies: rows.length })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'unsupported' }, 405)

  // Cron arm.
  if (req.headers.get('x-cron-secret') === CRON_SECRET) return refresh()

  // User arm: a real signed-in account, then a cooldown. The feed moves once a
  // day, so hammering Refresh buys nothing and only risks the upstream.
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return json({ error: 'forbidden' }, 403)

  const { data: user, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user?.user) return json({ error: 'forbidden' }, 403)

  const { data: status } = await sb
    .from('fx_status').select('last_attempt_at').eq('id', true).maybeSingle()
  const since = status?.last_attempt_at
    ? Date.now() - +new Date(status.last_attempt_at)
    : Number.POSITIVE_INFINITY
  if (since < MANUAL_COOLDOWN_MS) {
    return json({ ok: false, error: 'just checked — try again in a moment' }, 429)
  }

  return refresh()
})
