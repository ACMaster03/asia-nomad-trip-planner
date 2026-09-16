import { createClient } from '@supabase/supabase-js'

// SEND-ONLY client. Two calls use it, and both for the same reason: they put a
// LINK in an email, and an emailed link gets opened somewhere other than the
// browser that asked for it. `signInWithOtp` (the magic link) and
// `resetPasswordForEmail` (the password reset) both go through here.
//
// `signInWithPassword` does NOT — it has no email round trip at all, so none of
// the below applies to it, and it needs a client that actually keeps the
// session. It uses lib/supabase/client.ts.
//
// WHY IT EXISTS — the cross-browser sign-in failure (2026-08-27):
// The app-wide browser client (lib/supabase/client.ts) runs the PKCE flow. PKCE
// has signInWithOtp mint a secret "code verifier" and keep it in THIS browser's
// storage; the emailed link carries only the matching code. Both halves must
// meet, so the link can only be completed in the browser that asked for it.
// Tapping the link inside Gmail/Mail opens their own in-app browser — a
// different store, no verifier — and exchangeCodeForSession fails. The reader
// gets "Sign-in link invalid or expired" for a link that is neither.
// The repo predicted this twice: docs/PHONE-TESTPLAN.md ("known iOS trap") and
// docs/archive/.../06-critique-A.md ("the exchange *fails*, not just annoys").
//
// flowType 'implicit' issues NO verifier, so the emailed link is redeemable
// anywhere: as a plain `token_hash` that /auth/confirm verifies server-side
// (the shape auth/confirm was always written for), or, until the Supabase email
// template is repointed there, as tokens in the callback URL fragment — which
// /auth/callback now also accepts. Either way, no browser-bound secret.
//
// persistSession/autoRefreshToken/detectSessionInUrl are all off: this client
// must never own a session or touch storage. It sends the mail and is done —
// the real session is established by /auth/confirm or /auth/callback.
export function createOtpClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'implicit',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}
