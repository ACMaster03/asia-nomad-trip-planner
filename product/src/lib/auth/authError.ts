// Anything thrown or returned by supabase-js: `AuthError` satisfies this, and so
// does the plain `Error` a mutation's onError hands back, so no caller needs a
// cast to use this.
type MessageBearing = { message?: string | null }

// One reader-facing sentence for a Supabase auth failure. Shared by every auth
// surface (magic link, password sign-in, password reset) so they cannot drift
// apart — each passes the one sentence that fits when the provider gives us
// nothing to say.
//
// WHY THE `{}` CASE EXISTS (2026-08-21): supabase-js treats every 5xx as
// retryable and short-circuits BEFORE parsing the response body, handing its
// message extractor the raw Response — which carries no message field, so the
// extractor falls through to JSON.stringify() and the thrown error's `.message`
// is literally "{}". A mailer outage therefore reached the traveller as a red
// box containing two braces (the Resend key was rotated out from under the
// project and every send 500'd on SMTP 535).
//
// The real cause is only ever in the Supabase auth logs, so there is nothing
// more specific to say there — but `opaque` is at least actionable. Every other
// message is passed through untouched, because 4xx ones DO carry something
// useful: rate limits, "Signups not allowed for otp", "Invalid login
// credentials", a rejected address.
export function humanAuthError(error: MessageBearing, opaque: string): string {
  const raw = error.message?.trim()
  if (!raw || raw === '{}') return opaque
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'No connection. Check your network and try again.'
  }
  return raw
}

// Supabase answers BOTH "wrong password" and "this account has no password" with
// the same "Invalid login credentials" — deliberately, so nobody can probe which
// addresses exist. Correct, and unhelpful for this app specifically: every
// account here predates password sign-in, so on day one the overwhelmingly
// likely cause is the second one. The screens add a pointer back to the magic
// link when they see it, rather than leaving the reader to guess.
export function looksLikeNoPasswordSet(message: string): boolean {
  return /invalid login credentials/i.test(message)
}
