import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

// Server-side "is anyone signed in?" for the protected layout.
//
// Before this, ANY error from getClaims() sent the request to /login — including
// a fetch that failed because the Auth server was slow or the phone's radio
// had just woken up. The cookies were still there, so the NEXT request signed
// in fine: "it logged us out on one refresh and then logged back in on the
// next" (owner note, 2026-09-11). Only a genuinely missing/invalid session is
// a reason to go to /login. A transient failure gets one quick retry and then
// surfaces as an error page with a Retry button — the session is intact.

export type Claims = Record<string, unknown>

const TRANSIENT_NAMES = new Set(['AuthRetryableFetchError', 'AuthUnknownError'])

export function isTransientAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, status, message } = error as { name?: string; status?: number; message?: string }
  if (name && TRANSIENT_NAMES.has(name)) return true
  if (typeof status === 'number' && (status === 0 || status >= 500)) return true
  return /fetch failed|network|timeout|ECONNRESET|ETIMEDOUT/i.test(message ?? '')
}

export class AuthUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Couldn't verify your sign-in — the auth service didn't answer.")
    this.name = 'AuthUnavailableError'
    this.cause = cause
  }
}

export async function requireClaims(sb: SupabaseClient): Promise<Claims> {
  let { data, error } = await sb.auth.getClaims()
  if (!data?.claims && error && isTransientAuthError(error)) {
    await new Promise((r) => setTimeout(r, 400))
    ;({ data, error } = await sb.auth.getClaims())
  }
  if (data?.claims) return data.claims as Claims
  if (error && isTransientAuthError(error)) throw new AuthUnavailableError(error)
  redirect('/login')
}
