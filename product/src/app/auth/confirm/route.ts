import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/auth/safeNext'

// Magic-link / email OTP confirmation. The Supabase email template should point to:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/dashboard
//
// Both query values are attacker-controllable, so both are constrained: `type`
// against the OTP types we actually issue, and `next` through safeNextPath —
// the redirect fires after verifyOtp has set the session cookies, so an
// unvalidated path would hand a signed-in visitor straight to another origin.
const OTP_TYPES: readonly EmailOtpType[] = ['magiclink', 'signup', 'invite', 'recovery', 'email_change', 'email']

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const rawType = searchParams.get('type')
  const type = OTP_TYPES.find((t) => t === rawType)
  const next = safeNextPath(searchParams.get('next'))

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(new URL(next, origin))
  }
  return NextResponse.redirect(new URL('/auth/auth-code-error', origin))
}
