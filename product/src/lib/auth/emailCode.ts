import type { SupabaseClient } from '@supabase/supabase-js'

// The code in the sign-in email, typed where the sign-in was asked for (#121).
//
// The emailed LINK signs in whichever browser opens it, and on a phone that is
// rarely the one the person uses: Mail and Gmail open links in their own
// in-app browser, and an iPhone's home-screen icon keeps a cookie jar of its
// own that no link ever reaches. A follower who taps the link is signed in
// somewhere she never goes back to, and her icon asks her to sign in again.
// The code has no such problem: it is verified by the page that asked for it,
// so the session lands in that page's own browser.
//
// The same email carries both (supabase/email-templates/, {{ .Token }}); the
// length is `otp_length` in supabase/config.toml, 8 today.

// Digits only, spaces and dashes dropped (people copy "1234 5678").
export function normaliseCode(raw: string): string {
  return raw.replace(/[\s-]/g, '')
}

export function looksLikeCode(raw: string): boolean {
  return /^\d{6,10}$/.test(normaliseCode(raw))
}

// `sb` must be the SESSION-OWNING client (lib/supabase/client.ts), never the
// send-only one in lib/supabase/otp.ts: that one keeps no session, so the
// verify would succeed and leave nothing behind. Type 'email' covers both the
// magic-link email and a new address's confirmation email.
export async function verifyEmailCode(sb: SupabaseClient, email: string, raw: string) {
  return sb.auth.verifyOtp({ email: email.trim(), token: normaliseCode(raw), type: 'email' })
}

// Supabase answers a wrong, used or replaced code alike: "Token has expired or
// is invalid". Each new email replaces the last one's code, which is the usual
// cause after "Send again".
export function codeErrorText(message: string | null | undefined): string | null {
  if (/token has expired or is invalid|otp.*(expired|invalid)/i.test(message ?? '')) {
    return "That code didn't work. Use the newest email: each one replaces the last one's code."
  }
  return null
}
