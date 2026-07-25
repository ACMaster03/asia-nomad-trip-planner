// Shared Resend sender. Exists because on 2026-07-24 an ALERTS_FROM pointing at
// an unverified domain made Resend 403 EVERY send — deadline alerts and digests
// both — and the callers only checked `res.ok`, so a total email outage looked
// like a bare 502 and went unnoticed for a day.
//
// Rule learned: never discard a provider's error body. Resend's messages are
// specific and actionable ("You can only send testing emails to your own email
// address"); throwing them away is what made the outage invisible.

export interface EmailPayload {
  from: string
  to: string
  subject: string
  text: string
  headers?: Record<string, string>
}

export interface SendResult {
  ok: boolean
  status?: number
  /** Provider message plus a hint, safe to put in cron-secret-protected output. */
  error?: string
}

/** Turn the common Resend rejections into something that names the actual fix. */
function hint(status: number, body: string): string {
  if (status === 401 || status === 403) {
    if (/testing emails|own email address/i.test(body)) {
      return ' — HINT: no verified domain in Resend, so the only usable sender is ' +
        'onboarding@resend.dev and it delivers ONLY to the Resend account owner. ' +
        'Check ALERTS_FROM, and verify a domain before setting a custom sender.'
    }
    if (/domain is not verified|not verified/i.test(body)) {
      return ' — HINT: the ALERTS_FROM domain is not verified in Resend.'
    }
    if (status === 401) return ' — HINT: RESEND_API_KEY is missing or invalid.'
  }
  if (status === 422) return ' — HINT: Resend rejected the payload shape (from/to/headers).'
  if (status === 429) return ' — HINT: Resend rate limit; the caller should retry later.'
  return ''
}

export async function sendEmail(apiKey: string, payload: EmailPayload): Promise<SendResult> {
  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    // Network/DNS failure never even reached Resend.
    const error = `resend unreachable: ${e instanceof Error ? e.message : String(e)}`
    console.error('[resend]', error)
    return { ok: false, error }
  }

  if (res.ok) return { ok: true, status: res.status }

  const body = await res.text().catch(() => '')
  const error = `resend ${res.status}: ${body.slice(0, 300)}${hint(res.status, body)}`
  // Always logged, so even callers that must stay vague to their own caller
  // (the anon subscribe endpoint) leave a trail in the function logs.
  console.error('[resend] send failed —', error)
  return { ok: false, status: res.status, error }
}
