// Shared x-cron-secret check for the scheduled functions.
//
// WHY NOT `!==`: comparing the presented header to the secret with a plain
// string comparison short-circuits on the first differing byte, so the time it
// takes leaks how long a correct prefix was — enough, over many attempts, to
// recover the secret byte by byte. Hashing both sides first gives two
// fixed-length digests, and the XOR-accumulating loop below looks at every byte
// whatever the input, so the comparison takes the same time for any guess.
//
// SHA-256 via Web Crypto rather than Deno's non-standard
// crypto.subtle.timingSafeEqual: this runs unchanged on any runtime.
//
// FAIL CLOSED: an unset CRON_SECRET, or a request with no header at all, is a
// refusal — a missing secret must never turn these into open endpoints.

const CRON_SECRET = Deno.env.get('CRON_SECRET')

async function digest(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([digest(a), digest(b)])
  let diff = 0
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i]
  return diff === 0
}

/** True only for a request carrying the configured shared secret. */
export async function hasCronSecret(req: Request): Promise<boolean> {
  const presented = req.headers.get('x-cron-secret')
  if (!CRON_SECRET || !presented) return false
  return await timingSafeEqual(presented, CRON_SECRET)
}
