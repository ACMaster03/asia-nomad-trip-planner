// Shared cron authentication for the scheduled functions.
//
// SCHEME (migration 30): the caller does NOT send the shared secret. It sends a
// short-lived HMAC signature over a Unix timestamp:
//
//   x-cron-ts:  <unix seconds>
//   x-cron-sig: hex( HMAC-SHA256(secret, x-cron-ts) )
//
// WHY, not the raw secret: pg_net stores request headers VERBATIM in
// net.http_request_queue, and on Supabase that table carries platform-pinned
// PUBLIC grants we cannot revoke (see 29-privacy-hardening + the TP29-7 note).
// A raw `x-cron-secret` sitting there is a standing credential disclosure.
// A signature is not: it reveals nothing about the secret, and it is only
// valid inside a narrow time window, so reading it back later buys nothing.
//
// The secret itself lives in exactly two locked places — the CRON_SECRET
// function env (here) and public.app_config.cron_secret (RLS-locked, readable
// only by postgres/service_role) — and must be identical in both.
//
// FAIL CLOSED: an unset CRON_SECRET, a missing/malformed header, a stale
// timestamp, or a bad signature are all refusals. A missing secret must never
// turn these into open endpoints.

const CRON_SECRET = Deno.env.get('CRON_SECRET')

// How far the presented timestamp may be from now, either direction. Covers
// clock skew between the database host and the function runtime plus the
// queue's own dispatch latency; small enough that a signature scraped from the
// queue is useless within minutes.
const WINDOW_SECONDS = 300

const encoder = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
  // lowercase hex — must match Postgres `encode(hmac(...), 'hex')` exactly
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time compare of two strings. SHA-256 both sides first so the loop
// length never depends on the inputs — a plain `===` (or an early
// length-mismatch return over the raw values) leaks how much of a guess was
// right, one byte at a time.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const va = new Uint8Array(ha)
  const vb = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

/** True only for a request carrying a fresh, correctly-signed cron timestamp. */
export async function hasCronSecret(req: Request): Promise<boolean> {
  if (!CRON_SECRET) return false
  const ts = req.headers.get('x-cron-ts')
  const sig = req.headers.get('x-cron-sig')
  if (!ts || !sig) return false

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return false
  const nowSec = Date.now() / 1000
  if (Math.abs(nowSec - tsNum) > WINDOW_SECONDS) return false

  const expected = await hmacHex(CRON_SECRET, ts)
  return await timingSafeEqual(sig, expected)
}
